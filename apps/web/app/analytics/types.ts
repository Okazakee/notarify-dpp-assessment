/**
 * The analytics response contracts, validated at the boundary.
 *
 * The API is the authority for these shapes; this file only re-declares what the UI
 * reads and checks it before rendering, so a malformed response becomes a visible error
 * instead of an undefined cell.
 */

export type DashboardSummary = {
  totalProducts: number
  publishedPassports: number
  generatedQrCodes: number
  totalPassportViews: number
}

export type WeeklyScanBucket = {
  dateUtc: string
  count: number
}

export type MostViewedPassport = {
  publicUuid: string
  name: string | null
  sku: string | null
  serialNumber: string | null
  views: number
}

export type LatestScan = {
  occurredAt: string
  publicUuid: string
  name: string | null
  sku: string | null
  serialNumber: string | null
  browser: string | null
  operatingSystem: string | null
  language: string | null
  country: string | null
  countrySource: 'MOCK' | 'NOT_CAPTURED'
  /** Present only for an Admin; the API omits the property for an Editor. */
  ipAddress?: string | null
}

export type AnalyticsOverview = {
  rangeDays: number
  scansToday: number
  weeklyScans: WeeklyScanBucket[]
  mostViewed: MostViewedPassport[]
  latestScans: LatestScan[]
  countryIsMocked: true
}

export const ANALYTICS_RANGES = [7, 30, 90] as const
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number]

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isDashboardSummary(value: unknown): value is DashboardSummary {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.totalProducts === 'number' &&
    typeof value.publishedPassports === 'number' &&
    typeof value.generatedQrCodes === 'number' &&
    typeof value.totalPassportViews === 'number'
  )
}

function isWeeklyScanBucket(value: unknown): value is WeeklyScanBucket {
  return isRecord(value) && typeof value.dateUtc === 'string' && typeof value.count === 'number'
}

function isMostViewedPassport(value: unknown): value is MostViewedPassport {
  return (
    isRecord(value) &&
    typeof value.publicUuid === 'string' &&
    isNullableString(value.name) &&
    isNullableString(value.sku) &&
    isNullableString(value.serialNumber) &&
    typeof value.views === 'number'
  )
}

function isLatestScan(value: unknown): value is LatestScan {
  return (
    isRecord(value) &&
    typeof value.occurredAt === 'string' &&
    typeof value.publicUuid === 'string' &&
    isNullableString(value.name) &&
    isNullableString(value.sku) &&
    isNullableString(value.serialNumber) &&
    isNullableString(value.browser) &&
    isNullableString(value.operatingSystem) &&
    isNullableString(value.language) &&
    isNullableString(value.country) &&
    (value.countrySource === 'MOCK' || value.countrySource === 'NOT_CAPTURED') &&
    (value.ipAddress === undefined || isNullableString(value.ipAddress))
  )
}

export function isAnalyticsOverview(value: unknown): value is AnalyticsOverview {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.rangeDays === 'number' &&
    typeof value.scansToday === 'number' &&
    Array.isArray(value.weeklyScans) &&
    value.weeklyScans.every(isWeeklyScanBucket) &&
    Array.isArray(value.mostViewed) &&
    value.mostViewed.every(isMostViewedPassport) &&
    Array.isArray(value.latestScans) &&
    value.latestScans.every(isLatestScan) &&
    value.countryIsMocked === true
  )
}
