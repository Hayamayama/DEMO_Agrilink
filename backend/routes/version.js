import express from 'express';
import { execFileSync } from 'node:child_process';

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Demo-only deployment receipt. APP_COMMIT wins for packaged deployments;
 * a checked-out demo clone otherwise reports its actual Git SHA.
 */
export function versionRouter({ env = process.env, startedAt = new Date().toISOString(), commit = null } = {}) {
  const router = express.Router();
  const sha = commit || env.APP_COMMIT || gitCommit();
  router.get('/', (_req, res) => {
    res.json({
      ok: true,
      app: {
        name: 'AgriLink Demo',
        commit: sha,
        shortCommit: sha === 'unknown' ? sha : sha.slice(0, 7),
        startedAt,
        demoMode: env.DEMO_MODE === 'true',
      },
    });
  });
  return router;
}
