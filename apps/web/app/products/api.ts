import type { AssetUploadResponse } from './types.js'

export type ApiErrorPayload = {
  statusCode?: number
  code?: string
  message?: string | string[]
  requestId?: string
}

export class ProductApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly requestId: string | null

  constructor(
    status: number,
    message: string,
    code: string | null = null,
    requestId: string | null = null,
  ) {
    super(message)
    this.name = 'ProductApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload !== 'object' || payload === null) {
    return fallback
  }

  const candidate = payload as ApiErrorPayload
  if (Array.isArray(candidate.message)) {
    return candidate.message.join(', ')
  }
  return typeof candidate.message === 'string' && candidate.message.length > 0
    ? candidate.message
    : fallback
}

export async function readApiResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const candidate =
      typeof payload === 'object' && payload !== null ? (payload as ApiErrorPayload) : null
    throw new ProductApiError(
      response.status,
      getErrorMessage(payload, `Request failed (${response.status}).`),
      typeof candidate?.code === 'string' ? candidate.code : null,
      typeof candidate?.requestId === 'string' ? candidate.requestId : null,
    )
  }
  return payload as T
}

export function describeApiError(error: unknown, fallback: string): string {
  if (error instanceof ProductApiError) {
    if (error.status === 401) {
      return 'Your session has expired. Sign in again to continue.'
    }
    if (error.status === 404) {
      return 'The requested product could not be found.'
    }
    if (error.status === 409 && error.code === 'PRODUCT_SERIAL_CONFLICT') {
      return 'That serial number is already used by another product.'
    }
    return error.message
  }
  return error instanceof Error && error.message.length > 0 ? error.message : fallback
}

/** The authenticated fetch exposed by the auth context. */
export type AuthenticatedRequest = (path: string, init?: RequestInit) => Promise<Response>

/**
 * Uploads one file and returns its asset metadata.
 *
 * Shared by the file picker and drag-and-drop so there is a single upload
 * implementation. `Content-Type` is deliberately not set: the browser has to add the
 * multipart boundary itself.
 */
export async function uploadAsset(
  request: AuthenticatedRequest,
  file: File,
): Promise<AssetUploadResponse> {
  const body = new FormData()
  body.append('file', file)

  const response = await request('/assets', { method: 'POST', body })
  const payload = await readApiResponse<unknown>(response)

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as { id?: unknown }).id !== 'string'
  ) {
    throw new ProductApiError(502, 'The API returned invalid asset data.')
  }

  return payload as AssetUploadResponse
}

/**
 * Fetches asset bytes and wraps them in an object URL for rendering.
 *
 * The access token lives in memory and travels as a header, so an `<img src>` cannot
 * point at the asset route directly. Callers own the returned URL and must revoke it.
 */
export async function fetchAssetObjectUrl(
  request: AuthenticatedRequest,
  assetId: string,
): Promise<string> {
  const response = await request(`/assets/${assetId}`)
  if (!response.ok) {
    throw new ProductApiError(response.status, 'That file could not be loaded.')
  }

  return URL.createObjectURL(await response.blob())
}
