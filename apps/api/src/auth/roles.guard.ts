import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ApiException } from '../common/api-exception.js'
import type { UserRole } from '../generated/prisma/enums.js'
import type { AuthenticatedRequest } from './access-token.guard.js'
import { ROLES_METADATA_KEY } from './roles.decorator.js'

/**
 * Enforces `@Roles(...)` on top of `AccessTokenGuard`.
 *
 * The guard must be registered after `AccessTokenGuard`: it reads the authoritative
 * actor that guard resolved freshly from PostgreSQL, and it never inspects JWT claims.
 * A route without role metadata is unaffected.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Array<UserRole> | undefined>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    )
    if (required === undefined || required.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const actor = request.currentActor
    if (!actor) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_ACCESS_TOKEN',
        'Invalid access token.',
      )
    }
    if (!required.includes(actor.role)) {
      // A role refusal is deliberately uniform: it does not reveal whether the target
      // resource exists, belongs to another company or would be visible to another role.
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'INSUFFICIENT_ROLE',
        'This action is not available for this account.',
      )
    }
    return true
  }
}
