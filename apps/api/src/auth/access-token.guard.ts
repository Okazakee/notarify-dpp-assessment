import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common'
import { ApiException } from '../common/api-exception.js'
import type { ParsedRequest } from '../common/http-types.js'
import type { AuthenticatedActor } from './auth.service.js'
import { AuthService } from './auth.service.js'

type AuthenticatedRequest = ParsedRequest & {
  currentActor?: AuthenticatedActor
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const authorization = request.headers.authorization
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_ACCESS_TOKEN',
        'Invalid access token.',
      )
    }

    const token = authorization.slice('Bearer '.length).trim()
    if (token.length === 0) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_ACCESS_TOKEN',
        'Invalid access token.',
      )
    }

    const claims = await this.authService.verifyAccessToken(token)
    request.currentActor = await this.authService.resolveAccessTokenActor(claims)
    return true
  }
}

export type { AuthenticatedRequest }
