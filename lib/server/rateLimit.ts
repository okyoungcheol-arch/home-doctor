// Minimal in-memory, best-effort rate limiter (fixed window). Not distributed — resets per
// server instance/redeploy and offers no protection across multiple instances. Sized for this
// app's stated 개인/학습용 프로토타입 posture: it raises the bar against naive scripted phone-number
// enumeration on /api/manager-entry without requiring a Redis/KV dependency.
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// A caller (IP) that stops calling leaves its bucket in the map forever — nothing here ever
// iterates the whole map to sweep expired entries, since doing that on every call would defeat
// the point of an O(1) Map lookup. As a cheap safety valve against unbounded growth (e.g. many
// distinct/spoofed IPs each hitting the route once), the whole map is reset once it grows past
// this size rather than tracking per-entry expiry sweeps.
export const MAX_TRACKED_KEYS = 5000;

/**
 * Returns true if the call under `key` is allowed, false if the caller has exceeded `limit`
 * calls within the current `windowMs` window.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    if (buckets.size >= MAX_TRACKED_KEYS) {
      buckets.clear();
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) {
    return false;
  }

  bucket.count += 1;
  return true;
}

/** Best-effort caller identifier from proxy headers; falls back to a shared key when absent. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}
