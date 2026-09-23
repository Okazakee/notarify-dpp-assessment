import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { ApiException, ApiExceptionFilter } from '../common/api-exception.js'
import type { HttpResponse, ParsedRequest } from '../common/http-types.js'

/**
 * Returns true when an exception already carries this application's error envelope.
 *
 * `ApiException` responses always include a `code`, so anything that has one is left
 * untouched and keeps its specific meaning (`UNSUPPORTED_FILE_TYPE`,
 * `INVALID_FILE_CONTENT`, `FILE_TOO_LARGE` from the per-type check, and so on).
 */
function carriesApplicationCode(exception: HttpException): boolean {
  const body = exception.getResponse()
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { code?: unknown }).code === 'string'
  )
}

/**
 * Maps multipart parsing failures onto the repository's normal error envelope.
 *
 * `@nestjs/platform-express` converts Multer's errors before any filter runs — a
 * `LIMIT_FILE_SIZE` becomes a `PayloadTooLargeException`, and the other limit failures
 * become `BadRequestException`s — so those are recognised by status and by the absence
 * of an application error code rather than by the original Multer error class. Without
 * this they would surface as a generic `HTTP_ERROR` envelope.
 *
 * The route has no body DTO, so on this controller a code-less 400 can only come from
 * multipart parsing.
 */
@Catch()
export class UploadExceptionFilter implements ExceptionFilter {
  private readonly fallback = new ApiExceptionFilter()

  catch(exception: unknown, host: ArgumentsHost): void {
    if (!(exception instanceof HttpException) || carriesApplicationCode(exception)) {
      this.fallback.catch(exception, host)
      return
    }

    const status = exception.getStatus()
    const isTooLarge = status === HttpStatus.PAYLOAD_TOO_LARGE
    const isMalformed = status === HttpStatus.BAD_REQUEST

    if (!isTooLarge && !isMalformed) {
      this.fallback.catch(exception, host)
      return
    }

    const response = host.switchToHttp().getResponse<HttpResponse>()
    const request = host.switchToHttp().getRequest<ParsedRequest>()
    const mapped = new ApiException(
      isTooLarge ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST,
      isTooLarge ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD',
      isTooLarge
        ? 'The uploaded file exceeds the maximum allowed size.'
        : 'The upload request is not a valid single-file upload.',
    )

    response.setHeader('X-Request-Id', request.requestId ?? '')
    response.status(mapped.getStatus()).json(mapped.getResponse())
  }
}
