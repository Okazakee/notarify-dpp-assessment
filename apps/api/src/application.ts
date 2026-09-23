import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  BadRequestException,
  HttpStatus,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiException } from './common/api-exception.js'
import type { HttpResponse, ParsedRequest } from './common/http-types.js'
import type { AppEnvironment } from './config/configuration.js'
import { CreateProductDto } from './products/dto/create-product.dto.js'
import { ListProductsQueryDto } from './products/dto/list-products-query.dto.js'
import { PatchProductDto } from './products/dto/patch-product.dto.js'
import { PublishProductDto } from './publication/dto/publish-product.dto.js'

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
        return isProductValidation
          ? new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid product request.')
          : new BadRequestException(errors)
      },
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  )
}
