#!/usr/bin/env bash
# Run ON the server as the ubuntu user (needs sudo). Idempotent.
# Assumes nginx + a certbot-managed HTTPS server block already exist (hackathon host).
set -euo pipefail

REPO=https://github.com/dogbark-MeiChu/dogbark.git
DIR=$HOME/dogbark
SITE=/etc/nginx/sites-enabled/cloudphone-demo
SNIP=/etc/nginx/snippets/agrilink.conf
MAP=/etc/nginx/conf.d/agrilink-map.conf

[ -d "$DIR/.git" ] && git -C "$DIR" pull --ff-only || git clone "$REPO" "$DIR"
(cd "$DIR/backend" && npm ci --omit=dev)

sudo cp "$DIR/deploy/agrilink.service" /etc/systemd/system/agrilink.service
sudo systemctl daemon-reload
sudo systemctl enable --now agrilink
sudo systemctl restart agrilink

# nginx: websocket upgrade map (http context) + our location snippet
echo 'map $http_upgrade $connection_upgrade { default upgrade; "" close; }' | sudo tee "$MAP" >/dev/null
sudo cp "$DIR/deploy/agrilink.conf" "$SNIP"
if ! sudo grep -q 'snippets/agrilink.conf' "$SITE"; then
  # keep backups OUTSIDE sites-enabled (nginx includes everything in that dir)
  sudo mkdir -p /etc/nginx/backup && sudo cp "$SITE" "/etc/nginx/backup/cloudphone-demo.$(date +%s).bak"
  # insert after the 'root /var/www;' line of the 443 server block
  sudo sed -i '0,/root \/var\/www;/s||root /var/www;\n    include /etc/nginx/snippets/agrilink.conf;|' "$SITE"
fi
sudo nginx -t
sudo systemctl reload nginx
echo "OK: https://$(hostname -I | awk '{print $1}' | tr . -).sslip.io/"
