import { HttpStatus, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { isUUID } from 'class-validator'
import { AssetsService } from '../assets/assets.service.js'
import { ApiException } from '../common/api-exception.js'
import type { AppEnvironment } from '../config/configuration.js'
import type { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'
import {
  buildPassportContent,
  readPassportIdentity,
} from '../publication/passport-snapshot-content.js'
import type { ListPassportsQueryDto } from './dto/list-passports-query.dto.js'
import type {
  HistoricalPassportView,
  PassportHistorySummary,
  PassportListItem,
  PassportListResponse,
  PassportVersionsResponse,
} from './passports.types.js'

/**
 * The bounded back-office projection of one passport.
 *
 * `publicSnapshot` is selected because the passport's displayed identity must come from
 * what was actually published, not from the mutable draft. `draftRevision` is the only
 * live product field this projection needs.
 */
const PASSPORT_LIST_SELECT = {
  id: true,
  publicUuid: true,
  firstPublishedAt: true,
  withdrawnAt: true,
  product: { select: { id: true, draftRevision: true, deletedAt: true } },
  currentVersion: {
    select: {
      versionNumber: true,
      publishedAt: true,
      sourceDraftRevision: true,
      publicSnapshot: true,
    },
  },
} as const

type PassportListRow = Prisma.PassportGetPayload<{ select: typeof PASSPORT_LIST_SELECT }>

const VERSION_DETAIL_SELECT = {
  id: true,
  versionNumber: true,
  publishedAt: true,
  sourceDraftRevision: true,
  publicSnapshot: true,
} as const

/**
 * Authenticated, company-scoped passport reads for the back office.
 *
 * Everything here is scoped through the passport's product ownership, so a caller from
 * one company cannot learn whether another company has a passport, a version or an
 * asset. Every failure — malformed id, unknown passport, foreign passport, a version or
 * asset that is not part of the requested version — produces the same 404, because a
 * distinguishable error would itself disclose existence.
 *
 * Role separation is enforced before any query by `RolesGuard`; this service assumes an
 * authorized actor and never branches on role.
 */
@Injectable()
export class PassportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {}

  async list(companyId: string, query: ListPassportsQueryDto): Promise<PassportListResponse> {
    this.ensureCompanyId(companyId)

    // A passport without a current version is not an active publication and is excluded
    // rather than rendered as an empty row. Withdrawal **is** implemented now — deleting a
    // product withdraws its passport — so this filter is what keeps the back-office list
    // active-only, while exact historical inspection deliberately uses a wider scope.
    const where: Prisma.PassportWhereInput = {
      withdrawnAt: null,
      currentVersionId: { not: null },
      product: { companyId, deletedAt: null },
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.passport.count({ where }),
      this.prisma.passport.findMany({
        where,
        orderBy: [{ firstPublishedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: PASSPORT_LIST_SELECT,
      }),
    ])

    return {
      items: rows.flatMap((row) => {
        const item = this.mapListItem(row)
        return item === null ? [] : [item]
      }),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    }
  }

  /**
   * Every retained immutable version of one passport, newest first.
   *
   * The response also carries the passport's current publication metadata, so the
   * history page can label the current version and the public URL honestly without a
   * second request. It is deliberately not paginated: a passport's version count is
   * bounded by real republishes, and paginating a history list would add navigation
   * complexity for no real benefit.
   */
  async listVersions(companyId: string, passportId: string): Promise<PassportVersionsResponse> {
    this.ensureCompanyId(companyId)
    this.ensurePassportId(passportId)

    const passport = await this.findCompanyPassport(passportId, companyId)
    const currentVersionNumber = passport.currentVersion?.versionNumber ?? null
    if (currentVersionNumber === null) {
      throw this.passportNotFound()
    }

    const versions = await this.prisma.passportVersion.findMany({
      where: { passportId },
      orderBy: [{ versionNumber: 'desc' }, { id: 'asc' }],
      select: { versionNumber: true, publishedAt: true, sourceDraftRevision: true },
    })

    const item = this.mapHistorySummary(passport)
    if (item === null) {
      throw this.passportNotFound()
    }

    return {
      passport: item,
      versions: versions.map((version) => ({
        versionNumber: version.versionNumber,
        publishedAt: version.publishedAt.toISOString(),
        sourceDraftRevision: version.sourceDraftRevision,
        isCurrent: version.versionNumber === currentVersionNumber,
      })),
    }
  }

  /**
   * The immutable stored snapshot of one retained version.
   *
   * Read from `PassportVersion.publicSnapshot` only. The mutable product draft is never
   * consulted, so a later edit or republish cannot change what an older version reports.
   */
  async getVersion(
    companyId: string,
    passportId: string,
    versionNumber: string,
  ): Promise<HistoricalPassportView> {
    const { passport, version } = await this.resolveVersion(companyId, passportId, versionNumber)
    const content = buildPassportContent({ snapshot: version.publicSnapshot })
    const assetUrl = (assetId: string): string =>
      `/passports/${passportId}/versions/${version.versionNumber}/assets/${assetId}`

    // Downloadable files carry their stored original filename so the browser can name the
    // download. It is display metadata only; the bytes stay behind the authenticated route.
    const fileNames = await this.loadAssetFileNames(companyId, [
      ...content.documents.map((document) => document.assetId),
      ...content.certifications.flatMap((certification) =>
        certification.pdfAssetId === null ? [] : [certification.pdfAssetId],
      ),
    ])

    return {
      passport: {
        passportId: passport.id,
        productId: passport.product.id,
        publicUuid: passport.publicUuid,
        creationDate: passport.firstPublishedAt.toISOString(),
        version: version.versionNumber,
        status: 'PUBLISHED',
        verificationStatus: 'VERIFIED',
        publishedAt: version.publishedAt.toISOString(),
        sourceDraftRevision: version.sourceDraftRevision,
        isCurrent: version.versionNumber === passport.currentVersion?.versionNumber,
        currentVersionNumber: passport.currentVersion?.versionNumber ?? version.versionNumber,
      },
      brand: content.brand,
      product: content.product,
      materials: content.materials,
      sustainability: content.sustainability,
      certifications: content.certifications.map((certification) => ({
        ...certification,
        originalName:
          certification.pdfAssetId === null
            ? null
            : (fileNames.get(certification.pdfAssetId) ?? null),
        downloadUrl: certification.pdfAssetId === null ? null : assetUrl(certification.pdfAssetId),
      })),
      images: content.images.map((image) => ({ ...image, url: assetUrl(image.assetId) })),
      documents: content.documents.map((document) => ({
        ...document,
        originalName: fileNames.get(document.assetId) ?? null,
        downloadUrl: assetUrl(document.assetId),
      })),
    }
  }

  /**
   * Loads the bytes of an asset retained by exactly the requested version.
   *
   * Four independent conditions must hold: the passport belongs to the caller's company,
   * the version belongs to that passport, the asset has a `PassportVersionAsset` row for
   * that exact version, and the asset is still accepted with stored content. The
   * retained row authorizes retention only — it is keyed `(versionId, assetId)` and its
   * `role` column is never read here, because the snapshot, not this table, owns
   * semantic role and ordering.
   *
   * The company check stays inside the asset query through `AssetsService`, so an asset
   * that somehow reached another company's version would still be unreadable.
   */
  async readVersionAsset(
    companyId: string,
    passportId: string,
    versionNumber: string,
    assetId: string,
  ): Promise<{ detectedMime: string; originalName: string; bytes: Buffer }> {
    if (!isUUID(assetId)) {
      throw this.passportNotFound()
    }

    const { version } = await this.resolveVersion(companyId, passportId, versionNumber)
    const retained = await this.prisma.passportVersionAsset.findUnique({
      where: { versionId_assetId: { versionId: version.id, assetId } },
      select: { assetId: true },
    })
    if (retained === null) {
      throw this.passportNotFound()
    }

    try {
      return await this.assets.findForDownload(companyId, assetId)
    } catch (error) {
      // The asset module owns its own not-found; this route reports every failure
      // identically so a caller cannot separate "not retained" from "not yours".
      if (error instanceof ApiException && error.getStatus() === HttpStatus.NOT_FOUND) {
        throw this.passportNotFound()
      }
      throw error
    }
  }

  private async resolveVersion(
    companyId: string,
    passportId: string,
    versionNumber: string,
  ): Promise<{
    passport: PassportListRow
    version: Prisma.PassportVersionGetPayload<{ select: typeof VERSION_DETAIL_SELECT }>
  }> {
    this.ensureCompanyId(companyId)
    this.ensurePassportId(passportId)
    const parsedVersionNumber = this.parseVersionNumber(versionNumber)

    const passport = await this.findCompanyPassport(passportId, companyId)
    const version = await this.prisma.passportVersion.findUnique({
      where: { passportId_versionNumber: { passportId, versionNumber: parsedVersionNumber } },
      select: VERSION_DETAIL_SELECT,
    })
    if (version === null) {
      throw this.passportNotFound()
    }

    return { passport, version }
  }

  /**
   * Stored original filenames for display metadata, scoped to the caller's company.
   *
   * A name lookup that finds nothing simply yields no filename; it never authorizes
   * anything, so a missing row cannot widen access.
   */
  private async loadAssetFileNames(
    companyId: string,
    assetIds: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(assetIds)]
    if (unique.length === 0) {
      return new Map()
    }
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: unique }, companyId },
      select: { id: true, originalName: true },
    })
    return new Map(assets.map((asset) => [asset.id, asset.originalName]))
  }

  /**
   * Resolves a retained Passport for the actor's company.
   *
   * This is the gate for exact historical inspection, and it deliberately scopes by
   * company ownership **only**. The normal passport list stays active-only, but an Admin
   * must still be able to inspect the retained immutable versions of a Passport whose
   * product was soft-deleted or whose Passport was withdrawn — that history is exactly
   * what the soft-delete policy keeps. Nothing here becomes public: the anonymous surface
   * resolves its own active version and never calls this method.
   */
  private async findCompanyPassport(
    passportId: string,
    companyId: string,
  ): Promise<PassportListRow> {
    const passport = await this.prisma.passport.findFirst({
      where: { id: passportId, product: { companyId } },
      select: PASSPORT_LIST_SELECT,
    })
    if (passport === null) {
      throw this.passportNotFound()
    }
    return passport
  }

  /**
   * The lifecycle-aware summary shown beside a passport's retained history.
   *
   * The active list row and this summary answer different questions, so they are separate
   * projections of the same row. This one states whether the passport is still publicly
   * active and, when it is not, withholds the public action URLs entirely: a withdrawn
   * passport keeps its UUID, versions, QR bytes and current-version pointer, and every one
   * of those public endpoints answers 404, so advertising them here would be a lie.
   *
   * Active status is read from lifecycle state — `withdrawnAt` and the owning product's
   * `deletedAt` — and never inferred from the presence of a current version.
   */
  private mapHistorySummary(row: PassportListRow): PassportHistorySummary | null {
    const current = row.currentVersion
    if (current === null) {
      return null
    }

    const identity = readPassportIdentity(current.publicSnapshot)
    const isActive = row.withdrawnAt === null && row.product.deletedAt === null

    return {
      passportId: row.id,
      productId: row.product.id,
      product: identity ?? { name: null, sku: null, serialNumber: null },
      publicUuid: row.publicUuid,
      lifecycleStatus: isActive ? 'ACTIVE' : 'WITHDRAWN',
      currentVersionNumber: current.versionNumber,
      sourceDraftRevision: current.sourceDraftRevision,
      currentDraftRevision: row.product.draftRevision,
      hasUnpublishedChanges: row.product.draftRevision > current.sourceDraftRevision,
      firstPublishedAt: row.firstPublishedAt.toISOString(),
      currentPublishedAt: current.publishedAt.toISOString(),
      publicUrl: isActive ? `${this.publicAppOrigin()}/passport/${row.publicUuid}` : null,
      qrDownloadUrl: isActive ? `/passport/${row.publicUuid}/qr.png` : null,
      pdfDownloadUrl: isActive ? `/passport/${row.publicUuid}/pdf` : null,
    }
  }

  /**
   * Maps one row into the active back-office list contract.
   *
   * Returns `null` when a row has no current version, which the list filter already
   * excludes; the caller drops such a row instead of inventing placeholder identity.
   */
  private mapListItem(row: PassportListRow): PassportListItem | null {
    const current = row.currentVersion
    if (current === null) {
      return null
    }

    const identity = readPassportIdentity(current.publicSnapshot)
    return {
      passportId: row.id,
      productId: row.product.id,
      product: identity ?? { name: null, sku: null, serialNumber: null },
      publicUuid: row.publicUuid,
      status: 'PUBLISHED',
      currentVersionNumber: current.versionNumber,
      sourceDraftRevision: current.sourceDraftRevision,
      currentDraftRevision: row.product.draftRevision,
      hasUnpublishedChanges: row.product.draftRevision > current.sourceDraftRevision,
      firstPublishedAt: row.firstPublishedAt.toISOString(),
      currentPublishedAt: current.publishedAt.toISOString(),
      publicUrl: `${this.publicAppOrigin()}/passport/${row.publicUuid}`,
      qrDownloadUrl: `/passport/${row.publicUuid}/qr.png`,
      pdfDownloadUrl: `/passport/${row.publicUuid}/pdf`,
    }
  }

  private publicAppOrigin(): string {
    return this.config.getOrThrow<string>('PUBLIC_APP_ORIGIN')
  }

  private parseVersionNumber(value: string): number {
    if (!/^[0-9]+$/.test(value)) {
      throw this.passportNotFound()
    }
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw this.passportNotFound()
    }
    return parsed
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

  private ensurePassportId(passportId: string): void {
    if (!isUUID(passportId)) {
      throw this.passportNotFound()
    }
  }

  private passportNotFound(): ApiException {
    return new ApiException(HttpStatus.NOT_FOUND, 'PASSPORT_NOT_FOUND', 'Passport not found.')
  }
}
