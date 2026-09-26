import { Body, Controller, Get, HttpStatus, Patch, Req, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { AuditContext } from '../audit/audit.types.js'
import type { AuthenticatedRequest } from '../auth/access-token.guard.js'
import { AccessTokenGuard } from '../auth/access-token.guard.js'
import { Roles } from '../auth/roles.decorator.js'
import { RolesGuard } from '../auth/roles.guard.js'
import { ApiException } from '../common/api-exception.js'
import { UserRole } from '../generated/prisma/enums.js'
import { UpdateSettingsDto } from './dto/update-settings.dto.js'
import { SettingsService } from './settings.service.js'
import type { CompanySettings } from './settings.types.js'

/**
 * Company settings administration.
 *
 * Admin-only through the guard chain, and always scoped to the actor's company: the
 * request body never carries a company id, so there is nothing to tamper with.
 */
@ApiTags('settings')
@Controller('settings')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async get(@Req() request: AuthenticatedRequest): Promise<CompanySettings> {
    return this.settings.get(this.actorCompanyId(request))
  }

  @Patch()
  async update(
    @Req() request: AuthenticatedRequest,
    @Body() input: UpdateSettingsDto,
  ): Promise<CompanySettings> {
    return this.settings.update(this.auditContext(request), input)
  }

  private actorCompanyId(request: AuthenticatedRequest): string {
    const companyId = request.currentActor?.companyId
    if (!companyId) {
      throw this.invalidAccessToken()
    }
    return companyId
  }

  private auditContext(request: AuthenticatedRequest): AuditContext {
    const actor = request.currentActor
    if (!actor) {
      throw this.invalidAccessToken()
    }
    return {
      actorId: actor.id,
      companyId: actor.companyId,
      requestId: request.requestId ?? null,
    }
  }

  private invalidAccessToken(): ApiException {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      'INVALID_ACCESS_TOKEN',
      'Invalid access token.',
    )
  }
}
