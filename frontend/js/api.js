export async function getJSON(path, { timeout = 6000 } = {}) {
  const res = await fetch(path, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Thrown for any failed POST so callers can branch on a stable code instead of
// parsing messages. `code` matches the backend's error contract when it replied.
export class ApiError extends Error {
  constructor(code, message, { retryable = false } = {}) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

const OFFLINE = () => new ApiError('OFFLINE', 'No network. Check your signal.', { retryable: true });

// Combines the caller's cancel signal with a hard timeout, so Back/Cancel and a
// slow network both abort the same fetch.
function signalFor(signal, timeout) {
  const t = AbortSignal.timeout(timeout);
  if (!signal) return t;
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, t]) : signal;
}

async function post(path, init, { timeout, signal }) {
  if (navigator.onLine === false) throw OFFLINE();
  let res;
  try {
    res = await fetch(path, { method: 'POST', ...init, signal: signalFor(signal, timeout) });
  } catch (err) {
    if (signal?.aborted) throw new ApiError('CANCELLED', 'Cancelled.');
    throw err.name === 'TimeoutError'
      ? new ApiError('AI_TIMEOUT', 'AI is taking longer than usual.', { retryable: true })
      : OFFLINE();
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.ok === false) {
    const e = body?.error || {};
    throw new ApiError(e.code || `HTTP_${res.status}`, e.message || 'Something went wrong.', { retryable: Boolean(e.retryable) });
  }
  return body;
}

export function postJSON(path, data, { timeout = 15000, signal } = {}) {
  return post(path, { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }, { timeout, signal });
}

// FormData sets its own multipart boundary; never set content-type by hand here.
export function postFormData(path, formData, { timeout = 25000, signal } = {}) {
  return post(path, { body: formData }, { timeout, signal });
}
