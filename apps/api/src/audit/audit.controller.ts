import { Controller, Get, HttpStatus, Query, Req, UseGuards } from '@nestjs/common'
import type { AuthenticatedRequest } from '../auth/access-token.guard.js'
import { AccessTokenGuard } from '../auth/access-token.guard.js'
import { Roles } from '../auth/roles.decorator.js'
import { RolesGuard } from '../auth/roles.guard.js'
import { ApiException } from '../common/api-exception.js'
import { UserRole } from '../generated/prisma/enums.js'
import { AuditService } from './audit.service.js'
import type { AuditLogListResponse } from './audit.types.js'
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto.js'

/**
 * The Admin-only audit read surface.
 *
 * Audit detail is a raw-operations capability in the recorded permission matrix, so the
 * role check is a guard on the route rather than a hidden navigation item: an Editor
 * receives a uniform 403 before any query runs, and the service scopes every read to the
 * actor's company.
 *
 * The response is a safe DTO only. Recorded rows already contain bounded metadata, and
 * this projection adds the actor summary a reader needs without exposing credential
 * state, sessions or tokens.
 */
@Controller('audit-logs')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListAuditLogsQueryDto,
  ): Promise<AuditLogListResponse> {
    const companyId = request.currentActor?.companyId
    if (!companyId) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_ACCESS_TOKEN',
        'Invalid access token.',
      )
    }

    return this.audit.list(companyId, query)
  }
}
