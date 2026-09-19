#!/usr/bin/env bash
# Run on the CloudMosa VM as ubuntu. This intentionally manages only the
# independent guided-demo service, database, hostname and certificate.
set -euo pipefail

REPO=https://github.com/Hayamayama/DEMO_Agrilink.git
DIR=/home/ubuntu/DEMO_Agrilink
DB=agrilink_demo
APP_ROLE=agrilink_demo_app
MIGRATOR_ROLE=agrilink_demo_migrator
HOST=demo-203-116-30-130.sslip.io
SITE=/etc/nginx/sites-enabled/agrilink-demo

[ -d "$DIR/.git" ] && git -C "$DIR" pull --ff-only || git clone "$REPO" "$DIR"
(cd "$DIR/backend" && npm ci --omit=dev)

if ! sudo -u postgres psql -Atqc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -qx 1; then
  app_password="$(openssl rand -hex 32)"
  migrator_password="$(openssl rand -hex 32)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE $APP_ROLE LOGIN PASSWORD '$app_password'"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE $MIGRATOR_ROLE LOGIN PASSWORD '$migrator_password'"
  sudo -u postgres createdb --owner="$MIGRATOR_ROLE" "$DB"
  for migration in "$DIR"/backend/db/migrations/*.sql; do
    sed -e "s/agrilink_migrator/$MIGRATOR_ROLE/g" -e "s/agrilink_app/$APP_ROLE/g" "$migration" \
      | sudo -u postgres psql -v ON_ERROR_STOP=1 --dbname="$DB"
  done
  umask 077
  cat > "$DIR/backend/.env" <<EOF
DATABASE_URL=postgresql://$APP_ROLE:$app_password@127.0.0.1:5432/$DB
AUTH_LOOKUP_SECRET=$(openssl rand -hex 32)
NODE_ENV=production
DEMO_MODE=true
DEMO_USER_PHONE=9100000001
DEMO_USER_PIN=246810
SEED_DEMO_DATA=true
DEMO_DATE=2026-09-19
EOF
fi

sudo install -m 0644 "$DIR/deploy/agrilink-demo.service" /etc/systemd/system/agrilink-demo.service
sudo systemctl daemon-reload
sudo systemctl enable --now agrilink-demo
sudo systemctl restart agrilink-demo

# Serve the ACME challenge first; only after a certificate exists do we install
# the TLS server block. The existing formal nginx site is never edited.
sudo install -m 0644 "$DIR/deploy/agrilink-demo.http.conf" "$SITE"
sudo nginx -t
sudo systemctl reload nginx
if [ ! -f "/etc/letsencrypt/live/$HOST/fullchain.pem" ]; then
  sudo certbot certonly --webroot -w /var/www -d "$HOST" --non-interactive --agree-tos --register-unsafely-without-email
fi
sudo install -m 0644 "$DIR/deploy/agrilink-demo.https.conf" "$SITE"
sudo nginx -t
sudo systemctl reload nginx
echo "OK: https://$HOST/"
