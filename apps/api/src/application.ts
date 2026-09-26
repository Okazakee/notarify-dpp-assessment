import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  BadRequestException,
  HttpStatus,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SwaggerModule } from '@nestjs/swagger'
import { AnalyticsQueryDto } from './analytics/dto/analytics-query.dto.js'
import { ViewEventDto } from './analytics/dto/view-event.dto.js'
import { ListAuditLogsQueryDto } from './audit/dto/list-audit-logs-query.dto.js'
import { ApiException } from './common/api-exception.js'
import type { HttpResponse, ParsedRequest } from './common/http-types.js'
import type { AppEnvironment } from './config/configuration.js'
import { buildOpenApiDocument } from './openapi.js'
import { ListPassportsQueryDto } from './passports/dto/list-passports-query.dto.js'
import { CreateProductDto } from './products/dto/create-product.dto.js'
import { ListProductsQueryDto } from './products/dto/list-products-query.dto.js'
import { PatchProductDto } from './products/dto/patch-product.dto.js'
import { PublishProductDto } from './publication/dto/publish-product.dto.js'
import { UpdateSettingsDto } from './settings/dto/update-settings.dto.js'
import { CreateUserDto } from './users/dto/create-user.dto.js'
import { ListUsersQueryDto } from './users/dto/list-users-query.dto.js'
import { UpdateUserDto } from './users/dto/update-user.dto.js'

const require = createRequire(import.meta.url)
const cookieParser = require('cookie-parser') as () => (
  request: unknown,
  response: unknown,
  next: () => void,
) => void
const helmet = require('helmet') as () => (
  request: unknown,
  response: unknown,
  next: () => void,
) => void

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

type RequestWithId = ParsedRequest

type ResponseWithHeaders = HttpResponse

/** Apply the production HTTP middleware and validation configuration to a Nest app. */
export function configureApplication(app: INestApplication): void {
  app.use(helmet())
  app.use(cookieParser())
  app.use((request: RequestWithId, response: ResponseWithHeaders, next: () => void) => {
    const inbound = request.headers['x-request-id']
    const requestId =
      typeof inbound === 'string' && REQUEST_ID_PATTERN.test(inbound) ? inbound : randomUUID()
    request.requestId = requestId
    response.setHeader('X-Request-Id', requestId)

    // Every API response is dynamic. The public surface already declares this explicitly, and
    // the authenticated back office is lifecycle-sensitive: a cached projection of a Passport
    // that has since been withdrawn or republished would be actively misleading. Routes that
    // set the header themselves set the same value.
    response.setHeader('Cache-Control', 'no-store')

    next()
  })

  const config = app.get(ConfigService<AppEnvironment, true>)
  app.enableCors({
    credentials: true,
    origin: config.getOrThrow<string>('CORS_ORIGIN'),
  })
  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: (errors) => {
        const isProductValidation = errors.some(
          ({ target }) =>
            target instanceof CreateProductDto ||
            target instanceof PatchProductDto ||
            target instanceof ListProductsQueryDto ||
            target instanceof PublishProductDto,
        )
        const isPassportValidation = errors.some(
          ({ target }) => target instanceof ListPassportsQueryDto,
        )
        const isAnalyticsValidation = errors.some(
          ({ target }) => target instanceof AnalyticsQueryDto || target instanceof ViewEventDto,
        )
        const isAuditValidation = errors.some(
          ({ target }) => target instanceof ListAuditLogsQueryDto,
        )
        const isUserValidation = errors.some(
          ({ target }) =>
            target instanceof CreateUserDto ||
            target instanceof UpdateUserDto ||
            target instanceof ListUsersQueryDto,
        )
        const isSettingsValidation = errors.some(
          ({ target }) => target instanceof UpdateSettingsDto,
        )
        if (isProductValidation) {
          return new ApiException(
            HttpStatus.BAD_REQUEST,
            'VALIDATION_ERROR',
            'Invalid product request.',
          )
        }
        if (isPassportValidation) {
          return new ApiException(
            HttpStatus.BAD_REQUEST,
            'VALIDATION_ERROR',
            'Invalid passport request.',
          )
        }
        if (isAnalyticsValidation) {
          return new ApiException(
            HttpStatus.BAD_REQUEST,
            'VALIDATION_ERROR',
            'Invalid analytics request.',
          )
        }
        if (isAuditValidation) {
          return new ApiException(
            HttpStatus.BAD_REQUEST,
            'VALIDATION_ERROR',
            'Invalid audit request.',
          )
        }
        if (isUserValidation) {
          return new ApiException(
            HttpStatus.BAD_REQUEST,
            'VALIDATION_ERROR',
            'Invalid user request.',
          )
        }
        if (isSettingsValidation) {
          return new ApiException(
            HttpStatus.BAD_REQUEST,
            'VALIDATION_ERROR',
            'Invalid settings request.',
          )
        }
        return new BadRequestException(errors)
      },
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  )

  // Interactive API documentation, gated by the validated SWAGGER_ENABLED flag. It defaults
  // to enabled outside production and disabled in production, so an interactive console is
  // never exposed on a deployment by accident. The document is the same one that
  // `pnpm openapi:generate` writes to docs/openapi.json.
  if (config.getOrThrow<boolean>('SWAGGER_ENABLED')) {
    SwaggerModule.setup('docs', app, buildOpenApiDocument(app), { jsonDocumentUrl: 'docs-json' })
  }
}
