export function createPriceCacheRepository(pool) {
  const shape = (row) => row ? ({ ...row.payload_json, fetchedAt: row.fetched_at, expiresAt: row.expires_at }) : null;
  return {
    async latest(farmId, crop) {
      const row = (await pool.query(`SELECT payload_json,fetched_at,expires_at FROM app.price_snapshots
        WHERE farm_id=$1 AND crop=$2 ORDER BY fetched_at DESC LIMIT 1`, [farmId, crop])).rows[0];
      return shape(row);
    },
    async fresh(farmId, crop, now = new Date()) {
      const row = (await pool.query(`SELECT payload_json,fetched_at,expires_at FROM app.price_snapshots
        WHERE farm_id=$1 AND crop=$2 AND expires_at>$3 ORDER BY fetched_at DESC LIMIT 1`, [farmId, crop, now])).rows[0];
      return shape(row);
    },
    async save({ farmId, crop, provider = 'agmarknet', stateName, payload, fetchedAt, expiresAt }) {
      await pool.query(`INSERT INTO app.price_snapshots(farm_id,crop,provider,state_name,payload_json,fetched_at,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [farmId, crop, provider, stateName, payload, fetchedAt, expiresAt]);
      return payload;
    },
  };
}
