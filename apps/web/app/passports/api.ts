import { type AuthenticatedRequest, ProductApiError, readApiResponse } from '../products/api'
import {
  type HistoricalPassportView,
  isHistoricalPassportView,
  isPassportListResponse,
  isPassportVersionsResponse,
  type PassportListResponse,
  type PassportVersionsResponse,
} from './types'

/**
 * Authenticated back-office passport reads.
 *
 * Every response is validated before it reaches a component. The historical asset
 * fetchers return object URLs, because the access token lives in memory and an
 * authenticated `<img src>` cannot carry it; callers own the URLs and must revoke them.
 */

export async function fetchPassportList(
  request: AuthenticatedRequest,
  page: number,
  pageSize: number,
): Promise<PassportListResponse> {
  const response = await request(`/passports?page=${page}&pageSize=${pageSize}`)
  const payload = await readApiResponse<unknown>(response)
  if (!isPassportListResponse(payload)) {
    throw new ProductApiError(502, 'The API returned invalid passport data.')
  }
  return payload
}

export async function fetchPassportVersions(
  request: AuthenticatedRequest,
  passportId: string,
): Promise<PassportVersionsResponse> {
  const response = await request(`/passports/${encodeURIComponent(passportId)}/versions`)
  const payload = await readApiResponse<unknown>(response)
  if (!isPassportVersionsResponse(payload)) {
    throw new ProductApiError(502, 'The API returned invalid version history data.')
  }
  return payload
}

export async function fetchHistoricalPassportView(
  request: AuthenticatedRequest,
  passportId: string,
  versionNumber: number,
): Promise<HistoricalPassportView> {
  const response = await request(
    `/passports/${encodeURIComponent(passportId)}/versions/${versionNumber}`,
  )
  const payload = await readApiResponse<unknown>(response)
  if (!isHistoricalPassportView(payload)) {
    throw new ProductApiError(502, 'The API returned invalid historical passport data.')
  }
  return payload
}

/**
 * Fetches an asset retained by one historical version and wraps it in an object URL.
 *
 * These bytes are private: there is no public historical asset route, and the request
 * travels through the authenticated client. Callers own the returned URL and must
 * revoke it.
 */
export async function fetchPassportVersionAssetObjectUrl(
  request: AuthenticatedRequest,
  passportId: string,
  versionNumber: number,
  assetId: string,
): Promise<string> {
  const response = await request(
    `/passports/${encodeURIComponent(passportId)}/versions/${versionNumber}/assets/${encodeURIComponent(assetId)}`,
  )
  if (!response.ok) {
    throw new ProductApiError(response.status, 'That retained file could not be loaded.')
  }

  return URL.createObjectURL(await response.blob())
}
