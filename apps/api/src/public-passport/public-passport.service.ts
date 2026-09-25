import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { isUUID } from 'class-validator'
import { AnalyticsService } from '../analytics/analytics.service.js'
import type { AnalyticsRequestMetadata } from '../analytics/analytics.types.js'
import { AssetsService } from '../assets/assets.service.js'
import { PassportContentCache } from '../cache/passport-content-cache.service.js'
import type { AppEnvironment } from '../config/configuration.js'
import { PrismaService } from '../prisma/prisma.service.js'
import {
  buildPassportContent,
  type PassportContent,
} from '../publication/passport-snapshot-content.js'
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
    private readonly cache: PassportContentCache,
    private readonly analytics: AnalyticsService,
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
    passportId: string
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
        id: true,
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
      passportId: passport.id,
      publicUuid: passport.publicUuid,
      firstPublishedAt: passport.firstPublishedAt,
      versionId: version.id,
      versionNumber: version.versionNumber,
      publishedAt: version.publishedAt,
      publicSnapshot: version.publicSnapshot,
    }
  }

  /**
   * Interprets the immutable content of the already-selected current version.
   *
   * The cache never chooses which version is current: `resolveActive` has already asked
   * PostgreSQL for existence, visibility and the current-version pointer, and only the
   * interpreted content of that exact version may be served from Redis. The key carries
   * the passport and version identity, so a republish selects a different key and a warm
   * old entry can never be returned as current. A miss, a disabled cache, an outage or a
   * corrupt payload all fall back to the stored snapshot.
   */
  private async resolvePublishedContent(active: {
    passportId: string
    versionId: string
    publicSnapshot: unknown
  }): Promise<PassportContent> {
    const key = this.cache.key({ passportId: active.passportId, versionId: active.versionId })
    const cached = await this.cache.read(key, active.publicSnapshot)
    if (cached !== null) {
      return cached
    }

    const content = buildPassportContent({ snapshot: active.publicSnapshot })
    await this.cache.write(key, content, active.publicSnapshot)
    return content
  }

  /** The anonymous public projection of the current published version. */
  async getPassportView(publicUuid: string): Promise<PassportView> {
    const active = await this.resolveActive(publicUuid)

    return buildPassportView({
      content: await this.resolvePublishedContent(active),
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

    const passport = await this.prisma.passport.findUnique({
      where: { publicUuid: active.publicUuid },
      select: { qrPngBytes: true },
    })

    if (passport === null) {
      throw passportNotFound()
    }

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

  /**
   * Resolves a QR scan to its redirect target and the identity analytics needs.
   *
   * The visibility rules are the public page's rules, so a withdrawn, deleted or
   * unpublished passport is not resolvable here either. Returning the selected passport
   * and version together with the location keeps the redirect and the recorded event
   * describing the same resolution instead of resolving twice.
   */
  async getQrScan(publicUuid: string): Promise<{
    location: string
    passportId: string
    versionId: string
  }> {
    const active = await this.resolveActive(publicUuid)
    return {
      location: `${this.config.getOrThrow<string>('PUBLIC_APP_ORIGIN')}/passport/${active.publicUuid}`,
      passportId: active.passportId,
      versionId: active.versionId,
    }
  }

  /**
   * Records a QR scan best-effort.
   *
   * Resolution and recording are separate: the redirect target has already been resolved
   * against PostgreSQL, and a storage failure here is swallowed so a valid scan still
   * lands on its passport.
   */
  async recordQrHit(input: {
    passportId: string
    versionId: string
    metadata: AnalyticsRequestMetadata
  }): Promise<void> {
    await this.analytics.recordQrHit(input)
  }

  /**
   * Records one rendered-page view for a public passport.
   *
   * The passport is resolved with the same active-visibility rules as the public page,
   * so a view cannot be recorded for a withdrawn, deleted or unpublished passport. The
   * requested public version number must belong to that passport before its internal id
   * is used, which is what lets a page rendered immediately before a republish record the
   * version it actually displayed. This is ingestion only: it exposes no historical
   * content and returns no passport data.
   *
   * A persistence failure propagates so the caller can answer with a controlled
   * transient error; the client then retries the same event key, which is idempotent.
   */
  async recordView(input: {
    publicUuid: string
    version: number
    eventKey: string
    metadata: AnalyticsRequestMetadata
  }): Promise<void> {
    const active = await this.resolveActive(input.publicUuid)

    const version = await this.prisma.passportVersion.findFirst({
      where: { passportId: active.passportId, versionNumber: input.version },
      select: { id: true },
    })
    if (version === null) {
      // A version that does not belong to this passport is indistinguishable from a
      // passport that does not exist, so the public surface stays unprobeable.
      throw passportNotFound()
    }

    await this.analytics.recordView({
      passportId: active.passportId,
      versionId: version.id,
      eventKey: input.eventKey,
      metadata: input.metadata,
    })
  }

  /**
   * Resolves everything the PDF export needs from one active version.
   *
   * The view, the stored QR artifact and the retained image bytes are all read against a
   * single `resolveActive` result. That matters under concurrency: resolving the version
   * again for each step could mix a republish's two versions into one export (a v1 view
   * with v2's retained assets, or vice versa).
   *
   * Image authorization is the same rule the public asset route uses: only assets with a
   * `PassportVersionAsset` row for this exact version, still accepted and with stored
   * content, come back. Draft-only, historical-only, foreign and non-accepted assets are
   * absent rather than filtered afterwards.
   */
  async getCurrentVersionExport(publicUuid: string): Promise<{
    view: PassportView
    qrPng: Buffer
    retainedImages: Array<{ assetId: string; detectedMime: string; bytes: Buffer }>
  }> {
    const active = await this.resolveActive(publicUuid)
    const view = buildPassportView({
      content: await this.resolvePublishedContent(active),
      publicUuid: active.publicUuid,
      versionNumber: active.versionNumber,
      firstPublishedAt: active.firstPublishedAt,
      publishedAt: active.publishedAt,
      publicAppOrigin: this.config.getOrThrow<string>('PUBLIC_APP_ORIGIN'),
    })

    // The QR is passport-level, so a republish cannot change it, but a passport whose
    // stored artifact is missing is still not exportable.
    const passport = await this.prisma.passport.findUnique({
      where: { publicUuid: active.publicUuid },
      select: { qrPngBytes: true },
    })
    if (passport === null) {
      throw passportNotFound()
    }

    const imageIds = [...new Set(view.images.map((image) => image.assetId))].filter((assetId) =>
      isUUID(assetId),
    )
    const retained =
      imageIds.length === 0
        ? []
        : await this.prisma.passportVersionAsset.findMany({
            where: { versionId: active.versionId, assetId: { in: imageIds } },
            select: { assetId: true },
          })
    const contents = await this.assets.findAcceptedContentsByIds(retained.map((row) => row.assetId))

    return {
      view,
      qrPng: Buffer.from(passport.qrPngBytes),
      retainedImages: contents.map((content) => ({
        assetId: content.id,
        detectedMime: content.detectedMime,
        bytes: content.bytes,
      })),
    }
  }
}
