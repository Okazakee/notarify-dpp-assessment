export type ParsedRequest = {
  headers: Record<string, string | string[] | undefined>
  cookies?: Record<string, string | undefined>
  requestId?: string
}

export type CookieOptions = {
  httpOnly?: boolean
  maxAge?: number
  path?: string
  sameSite?: 'lax' | 'strict' | 'none'
  secure?: boolean
}

export type HttpResponse = {
  cookie(name: string, value: string, options: CookieOptions): void
  clearCookie(name: string, options: CookieOptions): void
  setHeader(name: string, value: string): void
  status(statusCode: number): HttpResponse
  json(body: unknown): void
}
