export const JWT_ISSUER = 'notarify-api'
export const JWT_AUDIENCE = 'notarify-client'

export type AppEnvironment = {
  ACCESS_TOKEN_TTL_SECONDS: number
  CORS_ORIGIN: string
  DATABASE_URL: string
  JWT_SECRET: string
  NODE_ENV: string
  PORT?: string
  PUBLIC_APP_ORIGIN: string
}
const PRODUCTION_PLACEHOLDERS: Record<string, true> = {
  'change-me': true,
  change_me: true,
  default: true,
  placeholder: true,
  secret: true,
  'test-secret': true,
  'your-secret': true,
  your_secret: true,
}

function requiredString(environment: Record<string, unknown>, name: string): string {
  const value = environment[name]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`)
  }
  return value.trim()
}

/**
 * Requires an absolute http(s) origin.
 *
 * Trailing slashes are stripped before validation, so a value such as `///` cannot
 * silently reduce to an empty string. Without this the production guard would pass and
 * published QR codes would encode a relative target that no phone can resolve.
 */
function absoluteOrigin(value: string, name: string): string {
  const withoutTrailingSlash = value.replace(/\/+$/, '')

  let parsed: URL
  try {
    parsed = new URL(withoutTrailingSlash)
  } catch {
    throw new Error(`${name} must be an absolute http(s) origin`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${name} must use http or https`)
  }
  if (parsed.origin !== withoutTrailingSlash) {
    throw new Error(`${name} must be an origin only, without a path, query or fragment`)
  }

  return withoutTrailingSlash
}

export function validateEnvironment(environment: Record<string, unknown>): AppEnvironment {
  const databaseUrl = requiredString(environment, 'DATABASE_URL')
  const jwtSecret = requiredString(environment, 'JWT_SECRET')
  const nodeEnvironment =
    typeof environment.NODE_ENV === 'string' && environment.NODE_ENV.trim().length > 0
      ? environment.NODE_ENV.trim()
      : 'development'

  if (
    nodeEnvironment === 'production' &&
    PRODUCTION_PLACEHOLDERS[jwtSecret.toLowerCase()] === true
  ) {
    throw new Error('JWT_SECRET must not be a placeholder in production')
  }

  // Testability: integration and browser tests need a short access-token lifetime
  // instead of waiting out the 10-minute default.
  const rawTtl = environment.ACCESS_TOKEN_TTL_SECONDS
  let accessTokenTtlSeconds = 600
  if (typeof rawTtl === 'string' && rawTtl.trim().length > 0) {
    const parsed = Number(rawTtl)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 86_400) {
      throw new Error('ACCESS_TOKEN_TTL_SECONDS must be an integer between 1 and 86400')
    }
    accessTokenTtlSeconds = parsed
  }

  let corsOrigin: string
  if (typeof environment.CORS_ORIGIN === 'string' && environment.CORS_ORIGIN.trim().length > 0) {
    corsOrigin = environment.CORS_ORIGIN.trim()
  } else if (nodeEnvironment === 'production') {
    throw new Error('CORS_ORIGIN is required in production')
  } else {
    // Development default: the Next.js dev/start port used by apps/web.
    corsOrigin = 'http://localhost:3001'
  }

  // The origin baked into QR target URLs. It must come from validated configuration
  // and never from a client-supplied Host header, because a printed QR code outlives
  // the request that produced it. Development default: the Next.js port used by apps/web.
  let publicAppOrigin: string
  if (
    typeof environment.PUBLIC_APP_ORIGIN === 'string' &&
    environment.PUBLIC_APP_ORIGIN.trim().length > 0
  ) {
    publicAppOrigin = absoluteOrigin(environment.PUBLIC_APP_ORIGIN.trim(), 'PUBLIC_APP_ORIGIN')
  } else if (nodeEnvironment === 'production') {
    throw new Error('PUBLIC_APP_ORIGIN is required in production')
  } else {
    publicAppOrigin = 'http://localhost:3001'
  }

  return {
    ACCESS_TOKEN_TTL_SECONDS: accessTokenTtlSeconds,
    CORS_ORIGIN: corsOrigin,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    NODE_ENV: nodeEnvironment,
    PUBLIC_APP_ORIGIN: publicAppOrigin,
    ...(typeof environment.PORT === 'string' ? { PORT: environment.PORT } : {}),
  }
}
