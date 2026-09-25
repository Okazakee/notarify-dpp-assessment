import { Injectable } from '@nestjs/common'
import { AnalyticsIngestRateLimiter } from './analytics-rate-limit.js'

/**
 * Conservative technical bounds for public analytics ingestion.
 *
 * Thirty accepted events per minute for one source address on one passport is far above
 * real reading behaviour and far below what would let a single caller write an unbounded
 * number of rows. These are safety limits for a prototype, not business metrics, and the
 * completion report records them as such.
 */
const INGEST_WINDOW_MS = 60_000
const INGEST_LIMIT_PER_WINDOW = 30
const INGEST_MAX_KEYS = 4_096

/**
 * The per-process bound on public analytics ingestion.
 *
 * Deliberately in memory and deliberately not Redis-backed: a cache outage must not
 * switch ingestion protection off, and protection must not be able to fail a valid QR
 * redirect. It is approximate by design — it is not a distributed limiter, and it makes
 * no attempt to be one.
 */
@Injectable()
export class AnalyticsIngestLimiter {
  private readonly qrHits = new AnalyticsIngestRateLimiter(
    INGEST_LIMIT_PER_WINDOW,
    INGEST_WINDOW_MS,
    INGEST_MAX_KEYS,
  )
  private readonly views = new AnalyticsIngestRateLimiter(
    INGEST_LIMIT_PER_WINDOW,
    INGEST_WINDOW_MS,
    INGEST_MAX_KEYS,
  )

  /** Records one attempt for a kind, address and passport. `false` means "refused". */
  take(input: { kind: 'QR_HIT' | 'VIEW'; ipAddress: string | null; publicUuid: string }): boolean {
    const limiter = input.kind === 'VIEW' ? this.views : this.qrHits
    return limiter.take(`${input.ipAddress ?? 'unknown'}:${input.publicUuid}`)
  }
}
