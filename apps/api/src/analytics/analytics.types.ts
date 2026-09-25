import type { AnalyticsEventKind, CountrySource } from '../generated/prisma/enums.js'

/** Where a recorded event came from. A bounded server-controlled identifier. */
export type AnalyticsEventSource = 'QR_REDIRECT' | 'PUBLIC_PAGE'

/**
 * Server-authoritative metadata attached to an accepted runtime event.
 *
 * Every field here is derived on the server. None of it is accepted from a request body
 * or query string, and the country is always the configured mock rather than anything
 * inferred from the caller.
 */
export type AnalyticsRequestMetadata = {
  ipAddress: string | null
  browser: string | null
  operatingSystem: string | null
  language: string | null
  country: string | null
  countrySource: CountrySource
  source: AnalyticsEventSource
}

/** The four assessment-required dashboard counters. */
export type DashboardSummary = {
  totalProducts: number
  publishedPassports: number
  generatedQrCodes: number
  totalPassportViews: number
}

/** One zero-filled UTC day of QR scan counts. */
export type WeeklyScanBucket = {
  dateUtc: string
  count: number
}

/**
 * A ranked published Passport.
 *
 * Identity describes the current published version, never an unpublished draft.
 */
export type MostViewedPassport = {
  publicUuid: string
  name: string | null
  sku: string | null
  serialNumber: string | null
  views: number
}

/**
 * One recent QR scan.
 *
 * `ipAddress` is present only in the Admin projection. The Editor projection omits the
 * property entirely rather than sending a null placeholder, so the raw address never
 * leaves the API for an Editor.
 */
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
  countrySource: CountrySource
  ipAddress?: string | null
}

export type AnalyticsOverview = {
  rangeDays: number
  scansToday: number
  weeklyScans: WeeklyScanBucket[]
  mostViewed: MostViewedPassport[]
  latestScans: LatestScan[]
  /** Makes the mocked country explicit in the response the UI renders. */
  countryIsMocked: true
}

export type { AnalyticsEventKind }
