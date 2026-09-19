import { COMMUNITIES, TAGS } from '../services/forumMeta.js';

// Idempotent upsert of the fixed communities and tags. Runs at startup with the
// application role (which has INSERT/UPDATE on the forum tables).
export async function ensureForumReference(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [i, c] of COMMUNITIES.entries()) {
      await client.query(`INSERT INTO app.forum_communities (slug, name, description, sort_order) VALUES ($1, $2, $3, $4)
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order`,
      [c.slug, c.name, c.description, i + 1]);
    }
    for (const [slug, community] of TAGS) {
      await client.query(`INSERT INTO app.forum_tags (slug, label, community_id)
        VALUES ($1, $2, (SELECT id FROM app.forum_communities WHERE slug = $3))
        ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label, community_id = EXCLUDED.community_id`,
      [slug, slug.replace(/-/g, ' '), community]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
}
