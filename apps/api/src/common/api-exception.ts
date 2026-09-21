import { randomUUID } from 'node:crypto'
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { HttpResponse, ParsedRequest } from './http-types.js'

export type ApiErrorBody = {
  statusCode: number
  code: string
  message: string
  requestId: string
}

type ApiExceptionBody = Omit<ApiErrorBody, 'requestId'>

export class ApiException extends HttpException {
  constructor(statusCode: HttpStatus, code: string, message: string) {
    super({ statusCode, code, message } satisfies ApiExceptionBody, statusCode)
  }
}

function defaultCode(statusCode: number): string {
  switch (statusCode) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST'
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED'
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN'
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND'
    case HttpStatus.CONFLICT:
      return 'CONFLICT'
    default:
      return statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'HTTP_ERROR'
  }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>()
    const request = host.switchToHttp().getRequest<ParsedRequest>()
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const requestId = request.requestId ?? randomUUID()
    response.setHeader('X-Request-Id', requestId)
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined

    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'statusCode' in exceptionResponse &&
      'code' in exceptionResponse &&
      'message' in exceptionResponse &&
      typeof exceptionResponse.statusCode === 'number' &&
      typeof exceptionResponse.code === 'string' &&
      typeof exceptionResponse.message === 'string'
    ) {
      const code = exceptionResponse.code
      this.logAuthFailure(statusCode, code, requestId)
      response.status(statusCode).json({
        statusCode,
        code,
        message: exceptionResponse.message,
        requestId,
      } satisfies ApiErrorBody)
      return
    }

    const message =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
        ? exceptionResponse.message
        : exceptionResponse
    const normalizedMessage = Array.isArray(message)
      ? message.join('; ')
      : typeof message === 'string'
        ? message
        : statusCode >= 500
          ? 'Internal server error.'
          : 'Request failed.'
    const code = defaultCode(statusCode)
    this.logAuthFailure(statusCode, code, requestId)
    response.status(statusCode).json({
      statusCode,
      code,
      message: normalizedMessage,
      requestId,
    } satisfies ApiErrorBody)
  }

  private logAuthFailure(statusCode: number, code: string, requestId: string): void {
    if (statusCode === HttpStatus.UNAUTHORIZED || statusCode === HttpStatus.FORBIDDEN) {
      this.logger.warn(`Auth failure requestId=${requestId} statusCode=${statusCode} code=${code}`)
    }
  }
}
