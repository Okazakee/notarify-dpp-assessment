import { readApiResponse } from '../products/api'
import {
  type AnalyticsOverview,
  type AnalyticsRange,
  type DashboardSummary,
  isAnalyticsOverview,
  isDashboardSummary,
} from './types'

/** The authenticated request function the auth context exposes. */
export type AuthorizedRequest = (path: string, init?: RequestInit) => Promise<Response>

/**
 * Reads the four dashboard counters.
 *
 * Both roles may read this; the API scopes it to the caller's company.
 */
export async function fetchDashboard(request: AuthorizedRequest): Promise<DashboardSummary> {
  const response = await request('/dashboard')
  const payload = await readApiResponse<unknown>(response)
  if (!isDashboardSummary(payload)) {
    throw new Error('The dashboard response was not in the expected shape.')
  }
  return payload
}

/**
 * Reads the analytics overview for a bounded ranking range.
 *
 * The weekly series and the recent scans are fixed windows on the server; only the
 * Most Viewed ranking follows `range`.
 */
export async function fetchAnalytics(
  request: AuthorizedRequest,
  range: AnalyticsRange,
): Promise<AnalyticsOverview> {
  const response = await request(`/analytics?range=${range}`)
  const payload = await readApiResponse<unknown>(response)
  if (!isAnalyticsOverview(payload)) {
    throw new Error('The analytics response was not in the expected shape.')
  }
  return payload
}
