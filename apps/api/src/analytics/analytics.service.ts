import { Injectable, Logger } from '@nestjs/common'
import type { UserRole } from '../generated/prisma/enums.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { readPassportIdentity } from '../publication/passport-snapshot-content.js'
import type {
  AnalyticsOverview,
  AnalyticsRequestMetadata,
  DashboardSummary,
  LatestScan,
  WeeklyScanBucket,
} from './analytics.types.js'

/** The fixed seven-day QR series the dashboard chart always shows. */
const WEEKLY_BUCKET_DAYS = 7

/** How many ranked products the Most Viewed section returns. */
const MOST_VIEWED_LIMIT = 5

/** How many ranked rows are fetched before the deterministic tie-break is applied. */
const MOST_VIEWED_CANDIDATE_LIMIT = 20

/** How many recent scans the Latest Scans section returns. */
const LATEST_SCAN_LIMIT = 20

export const ALLOWED_ANALYTICS_RANGE_DAYS = [7, 30, 90] as const
export const DEFAULT_ANALYTICS_RANGE_DAYS = 7

/** One UTC calendar day, as the `@db.Date` bucket the aggregate table stores. */
function utcDateBucket(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Owns analytics ingestion and reporting.
 *
 * Two rules shape this module:
 *
 * 1. Every recorded field is server-authoritative. A caller can influence *which*
 *    Passport an event belongs to, and nothing else — never the time, the address, the
 *    metadata or whether an event is synthetic.
 * 2. The raw event and its daily aggregate move together. A raw row without its daily
 *    increment, or a daily increment without a raw row, would make the two readings of
 *    the same fact disagree, so both are written in one transaction and a duplicate
 *    event changes neither.
 *
 * PostgreSQL is authoritative throughout. Redis is not involved in analytics at all:
 * accounting must not depend on a disposable cache.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a QR scan best-effort.
   *
   * QR resolution must not become dependent on analytics storage, so a failure here is
   * logged and swallowed: the caller still redirects a valid Passport. The event is
   * still written atomically with its daily bucket when it succeeds.
   */
  async recordQrHit(input: {
    passportId: string
    versionId: string
    metadata: AnalyticsRequestMetadata
  }): Promise<void> {
    try {
      await this.insertEvent({
        passportId: input.passportId,
        versionId: input.versionId,
        kind: 'QR_HIT',
        eventKey: null,
        metadata: input.metadata,
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error'
      this.logger.warn(`QR scan recording failed: ${reason}`)
    }
  }

  /**
   * Records a rendered-page view, exactly once per client event key.
   *
   * Returns whether a new event was stored. A retry with the same key inserts nothing
   * and leaves the daily bucket untouched, because the insert is conflict-safe rather
   * than a read-then-write check.
   *
   * Unlike a QR hit, a failure here propagates: the caller may then answer with a
   * controlled transient error so the client can retry the *same* key, and the client is
   * never told an uncommitted event was counted.
   */
  async recordView(input: {
    passportId: string
    versionId: string
    eventKey: string
    metadata: AnalyticsRequestMetadata
  }): Promise<boolean> {
    return this.insertEvent({
      passportId: input.passportId,
      versionId: input.versionId,
      kind: 'VIEW',
      eventKey: input.eventKey,
      metadata: input.metadata,
    })
  }

  /**
   * Writes one runtime event and its daily bucket in a single transaction.
   *
   * The raw insert uses `ON CONFLICT DO NOTHING` semantics on the unique event key, so
   * two concurrent retries of one navigation cannot both win and the daily counter can
   * only be incremented by the transaction that actually inserted the row.
   */
  private async insertEvent(input: {
    passportId: string
    versionId: string
    kind: 'QR_HIT' | 'VIEW'
    eventKey: string | null
    metadata: AnalyticsRequestMetadata
  }): Promise<boolean> {
    const occurredAt = new Date()
    const dateUtc = utcDateBucket(occurredAt)

    return this.prisma.$transaction(async (transaction) => {
      const inserted = await transaction.analyticsEvent.createMany({
        data: [
          {
            passportId: input.passportId,
            versionId: input.versionId,
            kind: input.kind,
            eventKey: input.eventKey,
            occurredAt,
            ipAddress: input.metadata.ipAddress,
            browser: input.metadata.browser,
            operatingSystem: input.metadata.operatingSystem,
            language: input.metadata.language,
            country: input.metadata.country,
            countrySource: input.metadata.countrySource,
            source: input.metadata.source,
            synthetic: false,
          },
        ],
        skipDuplicates: true,
      })

      if (inserted.count === 0) {
        return false
      }

      // Atomic upsert-and-increment. Reading the bucket first and writing a computed
      // value would lose concurrent increments; `ON CONFLICT ... count + 1` cannot.
      await transaction.$executeRaw`
        INSERT INTO "AnalyticsDaily"
          ("id", "passportId", "dateUtc", "kind", "synthetic", "count", "createdAt", "updatedAt")
        VALUES
          (gen_random_uuid(), ${input.passportId}::uuid, ${formatUtcDate(dateUtc)}::date,
           ${input.kind}::"AnalyticsEventKind", false, 1, now(), now())
        ON CONFLICT ("passportId", "dateUtc", "kind", "synthetic")
        DO UPDATE SET "count" = "AnalyticsDaily"."count" + 1, "updatedAt" = now()
      `

      return true
    })
  }

  /**
   * The four assessment dashboard counters for one company.
   *
   * Every counter is active-only by policy: a withdrawn passport or a soft-deleted
   * product leaves the published and view totals, so a counter may go down after a
   * future withdrawal. That is deliberate, not a monotonic event log.
   */
  async dashboard(companyId: string): Promise<DashboardSummary> {
    const activePassport = {
      withdrawnAt: null,
      currentVersionId: { not: null },
      product: { companyId, deletedAt: null },
    }

    const [totalProducts, publishedPassports, views] = await Promise.all([
      this.prisma.product.count({ where: { companyId, deletedAt: null } }),
      this.prisma.passport.count({ where: activePassport }),
      this.prisma.analyticsDaily.aggregate({
        _sum: { count: true },
        where: { kind: 'VIEW', synthetic: false, passport: activePassport },
      }),
    ])

    return {
      totalProducts,
      publishedPassports,
      // The QR artifact is allocated together with the Passport and its column is
      // non-nullable, so under the current lifecycle every active passport has one and
      // this equals `publishedPassports` by construction rather than by coincidence.
      generatedQrCodes: publishedPassports,
      totalPassportViews: views._sum.count ?? 0,
    }
  }

  /**
   * The analytics overview for one company.
   *
   * `role` shapes the response: an Admin receives the raw IP on recent scans, an Editor
   * never receives the property at all. Shaping happens here, in the response DTO
   * construction, so hiding is not a presentation concern.
   */
  async overview(input: {
    companyId: string
    rangeDays: number
    role: UserRole
  }): Promise<AnalyticsOverview> {
    const today = utcDateBucket(new Date())
    const weekStart = addUtcDays(today, -(WEEKLY_BUCKET_DAYS - 1))
    const rangeStart = addUtcDays(today, -(input.rangeDays - 1))

    const activePassport = {
      withdrawnAt: null,
      currentVersionId: { not: null },
      product: { companyId: input.companyId, deletedAt: null },
    }

    const [weeklyRows, rankingRows, latestRows] = await Promise.all([
      this.prisma.analyticsDaily.groupBy({
        by: ['dateUtc'],
        where: {
          kind: 'QR_HIT',
          synthetic: false,
          dateUtc: { gte: weekStart, lte: today },
          passport: activePassport,
        },
        _sum: { count: true },
      }),
      this.prisma.analyticsDaily.groupBy({
        by: ['passportId'],
        where: {
          kind: 'VIEW',
          synthetic: false,
          dateUtc: { gte: rangeStart, lte: today },
          passport: activePassport,
        },
        _sum: { count: true },
        orderBy: [{ _sum: { count: 'desc' } }, { passportId: 'asc' }],
        take: MOST_VIEWED_CANDIDATE_LIMIT,
      }),
      this.prisma.analyticsEvent.findMany({
        where: { kind: 'QR_HIT', synthetic: false, passport: activePassport },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: LATEST_SCAN_LIMIT,
        select: {
          occurredAt: true,
          ipAddress: true,
          browser: true,
          operatingSystem: true,
          language: true,
          country: true,
          countrySource: true,
          // The event's own version is the identity as it was at scan time, so a later
          // draft edit or republish cannot rewrite what a historical scan displayed.
          version: { select: { publicSnapshot: true } },
          passport: {
            select: {
              publicUuid: true,
              currentVersion: { select: { publicSnapshot: true } },
            },
          },
        },
      }),
    ])

    const weeklyCounts = new Map(
      weeklyRows.map((row) => [formatUtcDate(row.dateUtc), row._sum.count ?? 0]),
    )
    const weeklyScans: WeeklyScanBucket[] = []
    for (let offset = 0; offset < WEEKLY_BUCKET_DAYS; offset += 1) {
      const day = addUtcDays(weekStart, offset)
      const key = formatUtcDate(day)
      weeklyScans.push({ dateUtc: key, count: weeklyCounts.get(key) ?? 0 })
    }

    const ranked = await this.rankPassports(rankingRows)

    return {
      rangeDays: input.rangeDays,
      scansToday: weeklyCounts.get(formatUtcDate(today)) ?? 0,
      weeklyScans,
      mostViewed: ranked,
      latestScans: latestRows.map((row) => {
        const identity =
          readPassportIdentity(row.version?.publicSnapshot) ??
          readPassportIdentity(row.passport.currentVersion?.publicSnapshot)

        const scan: LatestScan = {
          occurredAt: row.occurredAt.toISOString(),
          publicUuid: row.passport.publicUuid,
          name: identity?.name ?? null,
          sku: identity?.sku ?? null,
          serialNumber: identity?.serialNumber ?? null,
          browser: row.browser,
          operatingSystem: row.operatingSystem,
          language: row.language,
          country: row.country,
          countrySource: row.countrySource,
        }

        // The raw address is Admin-only and omitted entirely for an Editor.
        if (input.role === 'ADMIN') {
          scan.ipAddress = row.ipAddress
        }

        return scan
      }),
      countryIsMocked: true,
    }
  }

  private async rankPassports(
    rows: Array<{ passportId: string; _sum: { count: number | null } }>,
  ): Promise<AnalyticsOverview['mostViewed']> {
    if (rows.length === 0) {
      return []
    }

    const passports = await this.prisma.passport.findMany({
      where: { id: { in: rows.map((row) => row.passportId) } },
      select: {
        id: true,
        publicUuid: true,
        currentVersion: { select: { publicSnapshot: true } },
      },
    })
    const byId = new Map(passports.map((passport) => [passport.id, passport]))

    return (
      rows
        .flatMap((row) => {
          const passport = byId.get(row.passportId)
          if (passport === undefined) {
            return []
          }
          const identity = readPassportIdentity(passport.currentVersion?.publicSnapshot)
          return [
            {
              publicUuid: passport.publicUuid,
              name: identity?.name ?? null,
              sku: identity?.sku ?? null,
              serialNumber: identity?.serialNumber ?? null,
              views: row._sum.count ?? 0,
            },
          ]
        })
        // The aggregate already ordered by count; the tie-break keeps equal counts stable
        // across requests instead of depending on database row order.
        .sort(
          (left, right) =>
            right.views - left.views ||
            (left.name ?? '').localeCompare(right.name ?? '') ||
            left.publicUuid.localeCompare(right.publicUuid),
        )
        .slice(0, MOST_VIEWED_LIMIT)
    )
  }

  /**
   * Non-synthetic view counts for the given passports, in one bounded query.
   *
   * Callers pass only currently active passports. This exists so a product list can show
   * a real Total Views column without issuing a query per row.
   */
  async totalViewsByPassport(passportIds: string[]): Promise<Map<string, number>> {
    if (passportIds.length === 0) {
      return new Map()
    }

    const rows = await this.prisma.analyticsDaily.groupBy({
      by: ['passportId'],
      where: { passportId: { in: passportIds }, kind: 'VIEW', synthetic: false },
      _sum: { count: true },
    })

    return new Map(rows.map((row) => [row.passportId, row._sum.count ?? 0]))
  }
}
