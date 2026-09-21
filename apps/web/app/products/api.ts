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
