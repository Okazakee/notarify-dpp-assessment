import { Controller, Get, HttpStatus, Param, Query, Req, Res, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { PDF_MIME_TYPE } from '../assets/asset-processing.js'
import type { AuthenticatedRequest } from '../auth/access-token.guard.js'
import { AccessTokenGuard } from '../auth/access-token.guard.js'
import { Roles } from '../auth/roles.decorator.js'
import { RolesGuard } from '../auth/roles.guard.js'
import { ApiException } from '../common/api-exception.js'
import { type BinaryHttpResponse, writeBinaryResponse } from '../common/binary-response.js'
import { UserRole } from '../generated/prisma/enums.js'
import { ListPassportsQueryDto } from './dto/list-passports-query.dto.js'
import { PassportsService } from './passports.service.js'
import type {
  HistoricalPassportView,
  PassportListResponse,
  PassportVersionsResponse,
} from './passports.types.js'

/**
 * The authenticated back-office passport surface.
 *
 * Current-publication management is available to every authenticated role: an Editor
 * publishes, so an Editor must be able to see what is published. Historical-version
 * inspection is an Admin capability, enforced here by `RolesGuard` on top of the
 * authoritative actor `AccessTokenGuard` resolves from PostgreSQL. Hiding the history
 * action in the UI is presentation only; these decorators are the rule.
 *
 * This controller is separate from the anonymous `public-passport` controller on
 * purpose. Nothing here is reachable without a session, and nothing there becomes
 * role-aware.
 */
@ApiTags('passports')
@Controller('passports')
@UseGuards(AccessTokenGuard, RolesGuard)
export class PassportsController {
  constructor(private readonly passports: PassportsService) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListPassportsQueryDto,
  ): Promise<PassportListResponse> {
    return this.passports.list(this.actorCompanyId(request), query)
  }

  @Get(':passportId/versions')
  @Roles(UserRole.ADMIN)
  async listVersions(
    @Req() request: AuthenticatedRequest,
    @Param('passportId') passportId: string,
  ): Promise<PassportVersionsResponse> {
    return this.passports.listVersions(this.actorCompanyId(request), passportId)
  }

  @Get(':passportId/versions/:versionNumber')
  @Roles(UserRole.ADMIN)
  async getVersion(
    @Req() request: AuthenticatedRequest,
    @Param('passportId') passportId: string,
    @Param('versionNumber') versionNumber: string,
  ): Promise<HistoricalPassportView> {
    return this.passports.getVersion(this.actorCompanyId(request), passportId, versionNumber)
  }

  /**
   * Serves an asset retained by one historical version.
   *
   * Private and authenticated: the default `same-origin` resource policy is kept, and no
   * public route is added to make historical rendering easier. The web app fetches these
   * bytes through the authenticated client and hands the browser a blob URL.
   */
  @Get(':passportId/versions/:versionNumber/assets/:assetId')
  @Roles(UserRole.ADMIN)
  async getVersionAsset(
    @Req() request: AuthenticatedRequest,
    @Param('passportId') passportId: string,
    @Param('versionNumber') versionNumber: string,
    @Param('assetId') assetId: string,
    @Res() response: BinaryHttpResponse,
  ): Promise<void> {
    const asset = await this.passports.readVersionAsset(
      this.actorCompanyId(request),
      passportId,
      versionNumber,
      assetId,
    )

    writeBinaryResponse(response, asset.bytes, {
      contentType: asset.detectedMime,
      originalName: asset.originalName,
      // PDFs download rather than render inline; images stay inline for the history view.
      disposition: asset.detectedMime === PDF_MIME_TYPE ? 'attachment' : 'inline',
    })
  }

  private actorCompanyId(request: AuthenticatedRequest): string {
    const companyId = request.currentActor?.companyId
    if (!companyId) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_ACCESS_TOKEN',
        'Invalid access token.',
      )
    }
    return companyId
  }
}
