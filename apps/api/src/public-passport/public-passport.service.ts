import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { isUUID } from 'class-validator'
import { AssetsService } from '../assets/assets.service.js'
import type { AppEnvironment } from '../config/configuration.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { buildPassportView, type PassportView, passportNotFound } from './passport-view.js'

/**
 * Anonymous public reads of published passports.
 *
 * Everything here resolves through the current **immutable** published version. The
 * mutable product draft is never a content source: it participates only in the
 * visibility check (`deletedAt`), which is why editing a draft cannot change what an
 * anonymous caller sees until the draft is republished.
 *
 * Every failure — malformed UUID, unknown passport, unpublished passport, withdrawn
 * passport, deleted product — collapses to the same 404 with the same body, so the
 * endpoint cannot be used to learn whether a given passport exists. A `410 Gone`
 * tombstone is deliberately deferred to the delete/withdraw lifecycle slice.
 */
@Injectable()
export class PublicPassportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {}

  /**
   * Resolves the current active published version for a public UUID.
   *
   * Active means the passport exists, names a current version, is not withdrawn, and
   * belongs to a product that is not soft-deleted. Withdrawal and soft deletion are not
   * implemented yet, so those clauses are defensive: they are what stops a future
   * lifecycle change from accidentally leaving withdrawn content publicly readable.
   */
  private async resolveActive(publicUuid: string): Promise<{
    publicUuid: string
    firstPublishedAt: Date
    versionId: string
    versionNumber: number
    publishedAt: Date
    publicSnapshot: unknown
  }> {
    if (!isUUID(publicUuid)) {
      throw passportNotFound()
    }

    const passport = await this.prisma.passport.findFirst({
      where: {
        publicUuid,
        withdrawnAt: null,
        currentVersionId: { not: null },
        product: { deletedAt: null },
      },
      select: {
        publicUuid: true,
        firstPublishedAt: true,
        currentVersion: {
          select: {
            id: true,
            versionNumber: true,
            publishedAt: true,
            publicSnapshot: true,
          },
        },
      },
    })

    const version = passport?.currentVersion
    if (passport === null || version === undefined || version === null) {
      throw passportNotFound()
    }

    return {
      publicUuid: passport.publicUuid,
      firstPublishedAt: passport.firstPublishedAt,
      versionId: version.id,
      versionNumber: version.versionNumber,
      publishedAt: version.publishedAt,
      publicSnapshot: version.publicSnapshot,
    }
  }

  /** The anonymous public projection of the current published version. */
  async getPassportView(publicUuid: string): Promise<PassportView> {
    const active = await this.resolveActive(publicUuid)

    return buildPassportView({
      snapshot: active.publicSnapshot,
      publicUuid: active.publicUuid,
      versionNumber: active.versionNumber,
      firstPublishedAt: active.firstPublishedAt,
      publishedAt: active.publishedAt,
      publicAppOrigin: this.config.getOrThrow<string>('PUBLIC_APP_ORIGIN'),
    })
  }

  /**
   * Proves an asset may be served anonymously.
   *
   * Knowing an asset id is not enough. The asset must be retained by the **current**
   * active published version, which is what makes an old version's assets private again
   * once a republish stops referencing them, and keeps draft-only assets private.
   *
   * The retained row is a retention and authorization record only. It deliberately does
   * not decide semantic role or ordering: `PassportVersionAsset` is keyed
   * `(versionId, assetId)`, so one asset used in two roles has a single row, and the
   * snapshot is the authority for what the asset means.
   */
  async authorizePublishedAsset(publicUuid: string, assetId: string): Promise<boolean> {
    if (!isUUID(assetId)) {
      return false
    }

    const active = await this.resolveActive(publicUuid)

    const retained = await this.prisma.passportVersionAsset.findUnique({
      where: { versionId_assetId: { versionId: active.versionId, assetId } },
      select: { assetId: true },
    })

    return retained !== null
  }

  /**
   * Loads the stored QR artifact for an active passport.
   *
   * The bytes are the ones Stage 4.1 generated on first publication, so a QR code that
   * has already been printed keeps resolving to the same passport. A download is not a
   * scan and records nothing.
   */
  async getQrPng(publicUuid: string): Promise<{ bytes: Buffer; filename: string }> {
    const active = await this.resolveActive(publicUuid)

    const passport = await this.prisma.passport.findUniqueOrThrow({
      where: { publicUuid: active.publicUuid },
      select: { qrPngBytes: true },
    })

    return {
      bytes: Buffer.from(passport.qrPngBytes),
      filename: `passport-${active.publicUuid}-qr.png`,
    }
  }

  /**
   * The canonical browser-facing location for a QR scan.
   *
   * Built from validated configuration plus the stored public UUID only. The request's
   * `Host` header never contributes, so the redirect cannot be pointed at an attacker's
   * origin.
   */
  async getQrRedirectTarget(publicUuid: string): Promise<string> {
    const active = await this.resolveActive(publicUuid)
    return `${this.config.getOrThrow<string>('PUBLIC_APP_ORIGIN')}/passport/${active.publicUuid}`
  }

  /** Exposes the narrow asset read the controller needs, keeping bytes in AssetsModule. */
  async readAcceptedAsset(assetId: string): Promise<{
    detectedMime: string
    originalName: string
    bytes: Buffer
  } | null> {
    return this.assets.findAcceptedContentById(assetId)
  }
}
