import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = (name) => fs.readFileSync(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8');

async function setup() {
  const db = new PGlite();
  await db.exec('CREATE ROLE agrilink_app; CREATE ROLE agrilink_migrator;');
  await db.exec(migration('001_foundation.sql').replace(/CREATE EXTENSION[^;]*;/, ''));
  await db.exec(migration('002_marketplace.sql'));
  await db.exec(migration('004_identity_admin.sql'));
  await db.exec(migration('006_market_exchange.sql'));
  const one = async (sql, p) => (await db.query(sql, p)).rows[0];
  const region = await one("INSERT INTO app.regions (code, country_code, name) VALUES ('IN-BR-PATNA','IN','Patna') RETURNING id");
  const crop = await one("INSERT INTO app.crops (code, name) VALUES ('tomato','Tomato') RETURNING id");
  const seller = await one('INSERT INTO app.users DEFAULT VALUES RETURNING id');
  const buyer = await one('INSERT INTO app.users DEFAULT VALUES RETURNING id');
  return { db, one, region: region.id, crop: crop.id, seller: seller.id, buyer: buyer.id };
}

const listing = (c, over = {}) => {
  const v = { quantity: 120, reserved: 0, sold: 0, mode: 'negotiable', price: 28, ...over };
  return c.one(
    `INSERT INTO app.market_listings (seller_id, crop_id, quantity, reserved_quantity, sold_quantity, unit,
       pricing_mode, asking_price, currency_code, available_date, fulfillment, region_id, latitude, longitude,
       public_location_label, expires_at)
     VALUES ($1,$2,$3,$4,$5,'kg',$6,$7,'INR','2026-09-22','pickup',$8,25.5941,85.1376,'Patna District',
       now() + interval '2 days') RETURNING id`,
    [c.seller, c.crop, v.quantity, v.reserved, v.sold, v.mode, v.price, c.region]);
};

const rejects = (p, pattern) => assert.rejects(p, pattern);

test('migration set applies cleanly and lives in the app schema', async () => {
  const c = await setup();
  const { rows } = await c.db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'market\\_%' AND table_schema <> 'app'");
  assert.equal(rows.length, 0, 'no market_* table outside app');
  const t = await c.db.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='app' AND table_name LIKE 'market\\_%'");
  assert.equal(t.rows[0].n, 10);
});

test('listing quantity accounting cannot oversell', async () => {
  const c = await setup();
  await listing(c);
  await rejects(listing(c, { reserved: 100, sold: 30 }), /check/i);
  await rejects(listing(c, { quantity: 0 }), /check/i);
  await rejects(listing(c, { mode: 'fixed', price: null }), /check/i);
  await listing(c, { mode: 'request_offers', price: null });
  const l = await listing(c);
  await c.db.query('UPDATE app.market_listings SET reserved_quantity = 100 WHERE id = $1', [l.id]);
  await rejects(c.db.query('UPDATE app.market_listings SET reserved_quantity = reserved_quantity + 30 WHERE id = $1', [l.id]), /check/i);
});

test('offers: exactly one target, no self-offer, one live offer per user', async () => {
  const c = await setup();
  const l = await listing(c);
  const ins = (listingId, proposer, recipient) => c.db.query(
    'INSERT INTO app.market_offers (listing_id, buy_request_id, proposer_id, recipient_id) VALUES ($1,NULL,$2,$3) RETURNING id',
    [listingId, proposer, recipient]);
  await rejects(ins(l.id, c.seller, c.seller), /check/i);
  await rejects(c.db.query('INSERT INTO app.market_offers (proposer_id, recipient_id) VALUES ($1,$2)', [c.buyer, c.seller]), /check/i);
  const first = (await ins(l.id, c.buyer, c.seller)).rows[0];
  await rejects(ins(l.id, c.buyer, c.seller), /duplicate|unique/i);
  await c.db.query("UPDATE app.market_offers SET status = 'declined' WHERE id = $1", [first.id]);
  await ins(l.id, c.buyer, c.seller); // a fresh offer is fine after a decline
});

async function offerWithRevision(c) {
  const l = await listing(c);
  const o = await c.one('INSERT INTO app.market_offers (listing_id, proposer_id, recipient_id) VALUES ($1,$2,$3) RETURNING id', [l.id, c.buyer, c.seller]);
  const r = await c.one(
    `INSERT INTO app.market_offer_revisions (offer_id, revision_number, proposed_by, quantity, unit_price, currency_code, pickup_date, payment_method)
     VALUES ($1,1,$2,100,27,'INR','2026-09-22','cash_on_pickup') RETURNING id`, [o.id, c.buyer]);
  return { l, o, r };
}

test('offer revisions are immutable and numbered uniquely', async () => {
  const c = await setup();
  const { o, r } = await offerWithRevision(c);
  await rejects(c.db.query('UPDATE app.market_offer_revisions SET unit_price = 1 WHERE id = $1', [r.id]), /append-only/);
  await rejects(c.db.query('DELETE FROM app.market_offer_revisions WHERE id = $1', [r.id]), /append-only/);
  await rejects(c.db.query(
    `INSERT INTO app.market_offer_revisions (offer_id, revision_number, proposed_by, quantity, unit_price, currency_code, pickup_date, payment_method)
     VALUES ($1,1,$2,90,26,'INR','2026-09-22','cash_on_pickup')`, [o.id, c.seller]), /duplicate|unique/i);
  await c.db.query(
    `INSERT INTO app.market_offer_revisions (offer_id, revision_number, proposed_by, quantity, unit_price, currency_code, pickup_date, payment_method)
     VALUES ($1,2,$2,90,26,'INR','2026-09-22','cash_on_pickup')`, [o.id, c.seller]); // counter = new row
});

test('audit events are append-only', async () => {
  const c = await setup();
  const e = await c.one("INSERT INTO app.market_events (entity_type, entity_id, event_type) VALUES ('user', $1, 'x') RETURNING id", [c.buyer]);
  await rejects(c.db.query('UPDATE app.market_events SET event_type = $2 WHERE id = $1', [e.id, 'y']), /append-only/);
  await rejects(c.db.query('DELETE FROM app.market_events WHERE id = $1', [e.id]), /append-only/);
});

test('deal state guards: bilateral confirmation, handover, completion', async () => {
  const c = await setup();
  const { l, o, r } = await offerWithRevision(c);
  const deal = (status, extra = '') => c.db.query(
    `INSERT INTO app.market_deals (offer_id, offer_revision_id, listing_id, buyer_id, seller_id, quantity, unit_price,
       currency_code, estimated_total, terms_snapshot, status ${extra ? ', ' + extra.split('|')[0] : ''})
     VALUES ($1,$2,$3,$4,$5,100,27,'INR',2700,'{}', $6 ${extra ? ', ' + extra.split('|')[1] : ''}) RETURNING id`,
    [o.id, r.id, l.id, c.buyer, c.seller, status]);
  await rejects(deal('agreed'), /check/i); // nobody confirmed
  await rejects(deal('agreed', 'buyer_confirmed_at|now()'), /check/i); // only one side
  await rejects(deal('pickup_scheduled', 'buyer_confirmed_at, seller_confirmed_at|now(), now()'), /check/i); // no pickup date
  await rejects(deal('completed', 'buyer_confirmed_at, seller_confirmed_at, pickup_date|now(), now(), now()'), /check/i); // no handover
  await rejects(deal('cancelled'), /check/i); // no actor/reason
  const ok = await deal('agreed', 'buyer_confirmed_at, seller_confirmed_at|now(), now()');
  await rejects(deal('awaiting_confirmation'), /duplicate|unique/i); // one deal per offer
  assert.ok(ok.rows[0].id);
});

test('buyer and seller must differ on a deal', async () => {
  const c = await setup();
  const { l, o, r } = await offerWithRevision(c);
  await rejects(c.db.query(
    `INSERT INTO app.market_deals (offer_id, offer_revision_id, listing_id, buyer_id, seller_id, quantity, unit_price, currency_code, estimated_total, terms_snapshot)
     VALUES ($1,$2,$3,$4,$4,100,27,'INR',2700,'{}')`, [o.id, r.id, l.id, c.buyer]), /check/i);
});

test('ratings only for the two parties of a completed deal, once each', async () => {
  const c = await setup();
  const { l, o, r } = await offerWithRevision(c);
  const d = await c.one(
    `INSERT INTO app.market_deals (offer_id, offer_revision_id, listing_id, buyer_id, seller_id, quantity, unit_price, currency_code,
       estimated_total, terms_snapshot, buyer_confirmed_at, seller_confirmed_at, pickup_date)
     VALUES ($1,$2,$3,$4,$5,100,27,'INR',2700,'{}',now(),now(),'2026-09-22') RETURNING id`, [o.id, r.id, l.id, c.buyer, c.seller]);
  const rate = (rater, ratee) => c.db.query('INSERT INTO app.market_ratings (deal_id, rater_id, ratee_id, stars) VALUES ($1,$2,$3,5)', [d.id, rater, ratee]);
  await c.db.query("UPDATE app.market_deals SET status = 'pickup_scheduled' WHERE id = $1", [d.id]);
  await rejects(rate(c.buyer, c.seller), /completed deal/);
  await c.db.query(
    `UPDATE app.market_deals SET status = 'completed', handover_verified_at = now(), buyer_received_at = now(),
       seller_payment_status = 'received', completed_at = now() WHERE id = $1`, [d.id]);
  const stranger = (await c.one('INSERT INTO app.users DEFAULT VALUES RETURNING id')).id;
  await rejects(rate(stranger, c.seller), /two deal parties/);
  await rate(c.buyer, c.seller);
  await rejects(rate(c.buyer, c.seller), /duplicate|unique/i);
  await rate(c.seller, c.buyer);
});

test('notifications accept market types and still reject unknown ones', async () => {
  const c = await setup();
  const n = (type) => c.db.query("INSERT INTO app.notifications (user_id, type, payload) VALUES ($1,$2,'{}')", [c.buyer, type]);
  await n('market_offer');
  await n('market_deal');
  await n('listing_interest'); // pre-existing types survive
  await rejects(n('bogus'), /check/i);
});

test('buy request price range must be ordered', async () => {
  const c = await setup();
  const req = (min, max) => c.db.query(
    `INSERT INTO app.market_buy_requests (buyer_id, crop_id, quantity, unit, target_price_min, target_price_max, currency_code,
       needed_by, fulfillment, region_id, public_location_label, expires_at)
     VALUES ($1,$2,500,'kg',$3,$4,'INR','2026-09-25','buyer_pickup',$5,'Patna District', now() + interval '3 days')`,
    [c.buyer, c.crop, min, max, c.region]);
  await req(32, 35);
  await rejects(req(35, 32), /check/i);
});
