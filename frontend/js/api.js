export async function getJSON(path, { timeout = 6000 } = {}) {
  const res = await fetch(path, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
