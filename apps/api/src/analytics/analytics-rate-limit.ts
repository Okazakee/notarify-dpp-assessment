/**
 * A small bounded in-memory rate limiter for public analytics ingestion.
 *
 * It is deliberately not Redis-backed: ingestion protection must keep working when the
 * disposable cache is down, and a cache outage must not decide whether events are
 * accepted. It is also deliberately per-process and approximate — this is a technical
 * safety bound for a prototype, not a business metric, and it is not a distributed
 * limiter.
 *
 * The window is a fixed short window. Keys are bounded: expired windows are swept when
 * the map is full, and if a burst still fills it the oldest entries are dropped, so an
 * attacker cannot grow the map without bound.
 */
export class AnalyticsIngestRateLimiter {
  private readonly buckets = new Map<string, { windowStart: number; count: number }>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys: number,
  ) {}

  /** Records one attempt. Returns `false` once the key exhausted its window. */
  take(key: string, now: number = Date.now()): boolean {
    const bucket = this.buckets.get(key)
    if (bucket === undefined || now - bucket.windowStart >= this.windowMs) {
      this.makeRoom(now)
      this.buckets.set(key, { windowStart: now, count: 1 })
      return true
    }

    if (bucket.count >= this.limit) {
      return false
    }

    bucket.count += 1
    return true
  }

  private makeRoom(now: number): void {
    if (this.buckets.size < this.maxKeys) {
      return
    }

    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart >= this.windowMs) {
        this.buckets.delete(key)
      }
    }

    if (this.buckets.size < this.maxKeys) {
      return
    }

    // Still full after sweeping: drop the oldest insertions to stay bounded.
    let excess = this.buckets.size - this.maxKeys + 1
    for (const key of this.buckets.keys()) {
      this.buckets.delete(key)
      excess -= 1
      if (excess <= 0) {
        return
      }
    }
  }
}
