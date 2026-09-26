import { Controller, Get, HttpStatus, Query, Req, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { AuthenticatedRequest } from '../auth/access-token.guard.js'
import { AccessTokenGuard } from '../auth/access-token.guard.js'
import { ApiException } from '../common/api-exception.js'
import { AnalyticsService } from './analytics.service.js'
import type { AnalyticsOverview, DashboardSummary } from './analytics.types.js'
import { AnalyticsQueryDto } from './dto/analytics-query.dto.js'

/**
 * The authenticated reporting surface.
 *
 * Both roles may read the dashboard and the analytics overview: an Editor who can
 * publish also needs to see how the published passports perform. The role decides only
 * one thing here — whether the raw IP address appears on recent scans — and that is
 * decided in the response projection, never by hiding a field in the browser.
 *
 * Every query is company-scoped through the authoritative actor, and nothing is
 * cacheable, because these are live counts rather than published content.
 */
@ApiTags('analytics')
@Controller()
@UseGuards(AccessTokenGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  async dashboard(@Req() request: AuthenticatedRequest): Promise<DashboardSummary> {
    return this.analytics.dashboard(this.actorCompanyId(request))
  }

  @Get('analytics')
  async overview(
    @Req() request: AuthenticatedRequest,
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsOverview> {
    const actor = request.currentActor
    if (!actor) {
      throw this.invalidAccessToken()
    }

    return this.analytics.overview({
      companyId: actor.companyId,
      rangeDays: query.range,
      role: actor.role,
    })
  }

  private actorCompanyId(request: AuthenticatedRequest): string {
    const companyId = request.currentActor?.companyId
    if (!companyId) {
      throw this.invalidAccessToken()
    }
    return companyId
  }

  private invalidAccessToken(): ApiException {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      'INVALID_ACCESS_TOKEN',
      'Invalid access token.',
    )
  }
}
