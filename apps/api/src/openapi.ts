import type { INestApplication } from '@nestjs/common'
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger'

/**
 * The single OpenAPI document definition.
 *
 * Both the running application (Swagger UI at `/docs`) and the export script
 * (`pnpm openapi:generate`) build the document through this function, so the committed
 * artifact cannot describe a different API than the one being served.
 */

export const OPENAPI_TITLE = 'Notarify Digital Product Passport API'

export const OPENAPI_VERSION = '1.0.0'

export const OPENAPI_DESCRIPTION = [
  'Back office and anonymous API for the Notarify Digital Product Passport assessment.',
  '',
  'Authentication uses a short-lived bearer access token plus an opaque rotating refresh',
  'cookie scoped to `/auth`. Obtain a token from `POST /auth/login`, then use the Authorize',
  'button with that token.',
  '',
  'Authorization is server-authoritative: the access token carries no role claim, and the',
  'role and company are re-read from PostgreSQL on every protected request. The Admin-only',
  'areas are Product deletion, Users, Settings and the audit log.',
  '',
  'The anonymous public Passport surface requires no authentication at all.',
].join('\n')

/** Tag names, in the order a reviewer is likely to read them. */
const TAGS = [
  'health',
  'auth',
  'products',
  'assets',
  'publication',
  'public-passport',
  'passports',
  'analytics',
  'dashboard',
  'users',
  'settings',
  'audit-logs',
]

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle(OPENAPI_TITLE)
    .setDescription(OPENAPI_DESCRIPTION)
    .setVersion(OPENAPI_VERSION)
    .addServer('http://localhost:3000', 'Local reviewer API origin')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token returned by POST /auth/login.',
      },
      'access-token',
    )
    .addCookieAuth('refresh_token')

  for (const tag of TAGS) {
    config.addTag(tag)
  }

  return SwaggerModule.createDocument(app, config.build())
}
