const buckets = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX = 60;

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (buckets.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX) return true;
  hits.push(now);
  buckets.set(ip, hits);
  return false;
}
