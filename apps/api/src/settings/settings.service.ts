import { HttpStatus, Injectable } from '@nestjs/common'
import { isUUID } from 'class-validator'
import { AssetsService } from '../assets/assets.service.js'
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/audit.actions.js'
import { AuditService } from '../audit/audit.service.js'
import type { AuditContext } from '../audit/audit.types.js'
import { ApiException } from '../common/api-exception.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { UpdateSettingsDto } from './dto/update-settings.dto.js'
import type { CompanySettings } from './settings.types.js'

/**
 * Company settings administration.
 *
 * Two boundaries matter here:
 *
 * 1. **The company is the target, never a parameter.** The actor's company is the only
 *    company this service can read or write, so a caller cannot address another one.
 * 2. **Settings change mutable company state only.** A display name is copied into a
 *    Passport snapshot when a version is published, and snapshots are immutable, so an
 *    already-published version keeps the name it was published with until an explicit
 *    republish creates a new one.
 *
 * The logo is validated through the owning `AssetsService`, which enforces company
 * ownership, acceptance, stored content and an image type in one company-scoped query.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly audit: AuditService,
  ) {}

  async get(companyId: string): Promise<CompanySettings> {
    this.ensureCompanyId(companyId)
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { displayName: true, logoAssetId: true, updatedAt: true },
    })
    if (company === null) {
      throw this.companyNotFound()
    }
    return {
      displayName: company.displayName,
      logoAssetId: company.logoAssetId,
      updatedAt: company.updatedAt.toISOString(),
    }
  }

  /**
   * Applies the supplied settings and records the change in one transaction.
   *
   * An omitted field is unchanged; an explicit `null` logo clears it. A request that
   * changes nothing records no audit row, because nothing happened.
   */
  async update(context: AuditContext, input: UpdateSettingsDto): Promise<CompanySettings> {
    this.ensureCompanyId(context.companyId)

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.company.findUnique({
        where: { id: context.companyId },
        select: { displayName: true, logoAssetId: true },
      })
      if (current === null) {
        throw this.companyNotFound()
      }

      const changedFields: string[] = []
      const data: { displayName?: string; logoAssetId?: string | null } = {}

      if (input.displayName !== undefined) {
        const displayName = input.displayName.trim()
        if (displayName.length === 0) {
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            'VALIDATION_ERROR',
            'displayName must not be empty.',
          )
        }
        if (displayName !== current.displayName) {
          data.displayName = displayName
          changedFields.push('displayName')
        }
      }

      if (input.logoAssetId !== undefined) {
        if (input.logoAssetId === null) {
          if (current.logoAssetId !== null) {
            data.logoAssetId = null
            changedFields.push('logoAssetId')
          }
        } else {
          const logo = await this.assets.findCompanyAcceptedImage(
            context.companyId,
            input.logoAssetId,
          )
          if (logo === null) {
            // Foreign, missing, non-accepted, content-less and non-image all collapse to
            // one refusal, so a foreign asset cannot be probed for.
            throw new ApiException(
              HttpStatus.BAD_REQUEST,
              'LOGO_ASSET_UNAVAILABLE',
              'The selected logo is not an available image asset.',
            )
          }
          if (current.logoAssetId !== logo.id) {
            data.logoAssetId = logo.id
            changedFields.push('logoAssetId')
          }
        }
      }

      if (changedFields.length > 0) {
        await tx.company.update({ where: { id: context.companyId }, data })
        await this.audit.record(tx, {
          actorId: context.actorId,
          entityType: AUDIT_ENTITY_TYPES.COMPANY,
          entityId: context.companyId,
          action: AUDIT_ACTIONS.COMPANY_SETTINGS_UPDATED,
          requestId: context.requestId,
          // Field names only: no file bytes, no credentials, no company payload.
          safeMetadata: { changedFields },
        })
      }

      const result = await tx.company.findUniqueOrThrow({
        where: { id: context.companyId },
        select: { displayName: true, logoAssetId: true, updatedAt: true },
      })
      return result
    })

    return {
      displayName: updated.displayName,
      logoAssetId: updated.logoAssetId,
      updatedAt: updated.updatedAt.toISOString(),
    }
  }

  private companyNotFound(): ApiException {
    return new ApiException(HttpStatus.NOT_FOUND, 'COMPANY_NOT_FOUND', 'Company not found.')
  }

  private ensureCompanyId(companyId: string): void {
    if (!isUUID(companyId)) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_ACCESS_TOKEN',
        'Invalid access token.',
      )
    }
  }
}
