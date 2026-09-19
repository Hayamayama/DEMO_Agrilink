import crypto from 'node:crypto';

// One id per request, returned as X-Request-Id and in error bodies, so a farmer's "it failed"
// screenshot can be matched to the server log line.
export function requestId(req, res, next) {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
