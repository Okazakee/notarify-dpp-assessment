import { randomUUID } from 'node:crypto'
import { HttpStatus, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { isUUID } from 'class-validator'
import QRCode from 'qrcode'
import { assetKindForMime } from '../assets/asset-processing.js'
import { AssetsService } from '../assets/assets.service.js'
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/audit.actions.js'
import { AuditService } from '../audit/audit.service.js'
import { ApiException } from '../common/api-exception.js'
import type { AppEnvironment } from '../config/configuration.js'
import { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { ProductsService } from '../products/products.service.js'
import {
  buildSnapshot,
  collectPublicationGaps,
  collectRetainedAssets,
  publicationAssetTypeMismatch,
  publicationAssetUnavailable,
  publicationIncomplete,
  publicationRevisionConflict,
  SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOT_VERIFICATION_STATUS,
} from './publication.policy.js'
import type { PublicationResult } from './publication.types.js'

/**
 * Owns the publish transaction.
 *
 * Publication is the only place that turns mutable draft rows into an immutable
 * version. Everything it writes — the version, its retained asset references, the QR
 * artifact on first publication and the current-version pointer — is written in one
 * transaction, so a passport is never observable in a half-published state.
 *
 * It deliberately writes **no** `AuditEvent`. The audit-log bonus is a separate milestone
 * with its own event and action policy, so publication does not begin it with a single
 * isolated event type.
 */

/**
 * Renders the QR artifact for a passport target URL.
 *
 * An integer `scale` is used rather than `width`: a width that is not an exact multiple
 * of modules plus quiet zone produces a fractional scale, which puts modules on pixel
 * boundaries and can clip the quiet zone. A fixed scale keeps the code crisp and the
 * four-module quiet zone intact. No logo overlay, per the spec.
 */
async function renderQrPng(targetUrl: string): Promise<Buffer> {
  return QRCode.toBuffer(targetUrl, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 4,
    scale: 8,
  })
}

/**
 * Builds the publication response.
 *
 * Exposes stable publication metadata for future frontend consumers and deliberately
 * carries no QR bytes, no snapshot JSON and no asset bytes. Replay returns the same
 * Passport-level values, so a retry is indistinguishable from the original call apart
 * from `replayed`.
 */
function toResult(
  input: {
    passportId: string
    productId: string
    publicUuid: string
    versionId: string
    versionNumber: number
    sourceDraftRevision: number
    firstPublishedAt: Date
    publishedAt: Date
    qrTargetUrl: string
    replayed: boolean
  },
  publicAppOrigin: string,
): PublicationResult {
  return {
    passportId: input.passportId,
    productId: input.productId,
    publicUuid: input.publicUuid,
    versionId: input.versionId,
    versionNumber: input.versionNumber,
    sourceDraftRevision: input.sourceDraftRevision,
    firstPublishedAt: input.firstPublishedAt.toISOString(),
    publishedAt: input.publishedAt.toISOString(),
    publicUrl: `${publicAppOrigin}/passport/${input.publicUuid}`,
    qrTargetUrl: input.qrTargetUrl,
    verificationStatus: SNAPSHOT_VERIFICATION_STATUS,
    replayed: input.replayed,
  }
}

@Injectable()
export class PublicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly assets: AssetsService,
    private readonly config: ConfigService<AppEnvironment, true>,
    private readonly audit: AuditService,
  ) {}

  async publish(
    companyId: string,
    actorId: string,
    productId: string,
    expectedDraftRevision: number,
    requestId: string | null = null,
  ): Promise<PublicationResult> {
    if (!isUUID(productId)) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'PRODUCT_NOT_FOUND', 'Product not found.')
    }
    if (!Number.isInteger(expectedDraftRevision) || expectedDraftRevision < 0) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'expectedDraftRevision must be a non-negative integer.',
      )
    }

    const publicAppOrigin = this.config.getOrThrow<string>('PUBLIC_APP_ORIGIN')

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialize concurrent publications of this product, and hold the row so a
        // concurrent draft save cannot change the content mid-publication.
        const locked = await tx.$queryRaw<Array<{ draftRevision: number; deletedAt: Date | null }>>(
          Prisma.sql`
            SELECT "draftRevision", "deletedAt"
            FROM "Product"
            WHERE "id" = ${productId}::uuid
              AND "companyId" = ${companyId}::uuid
            FOR UPDATE
          `,
        )

        const product = locked[0]
        if (product === undefined || product.deletedAt !== null) {
          throw this.productNotFound()
        }
        if (product.draftRevision !== expectedDraftRevision) {
          throw publicationRevisionConflict()
        }

        const draft = await this.products.loadPublishableDraft(tx, companyId, productId)
        if (draft === null) {
          throw this.productNotFound()
        }

        const gaps = collectPublicationGaps(draft)
        if (gaps.length > 0) {
          throw publicationIncomplete(gaps)
        }

        // Revalidate every asset the version will reference. Validation performed when
        // an asset was attached to the draft proves nothing here: its state or its
        // company can change afterwards, and publication is the public visibility
        // boundary. This runs before any version is written, so a rejected publication
        // leaves no Passport, no new version and no retained references behind.
        const references: Array<{ assetId: string; expected: 'IMAGE' | 'PDF'; label: string }> = [
          ...draft.images.map((image) => ({
            assetId: image.assetId,
            expected: 'IMAGE' as const,
            label: 'image',
          })),
          ...draft.documents.map((document) => ({
            assetId: document.assetId,
            expected: 'PDF' as const,
            label: 'document',
          })),
          ...draft.certifications.flatMap((certification) =>
            certification.pdfAssetId === null
              ? []
              : [
                  {
                    assetId: certification.pdfAssetId,
                    expected: 'PDF' as const,
                    label: 'certification PDF',
                  },
                ],
          ),
        ]

        if (references.length > 0) {
          const resolved = await this.assets.findLinkableAssets(
            companyId,
            references.map((reference) => reference.assetId),
            tx,
          )

          for (const reference of references) {
            const asset = resolved.get(reference.assetId)
            if (asset === undefined) {
              throw publicationAssetUnavailable(reference.label)
            }
            if (assetKindForMime(asset.detectedMime) !== reference.expected) {
              throw publicationAssetTypeMismatch(reference.label)
            }
          }
        }

        const company = await tx.company.findUnique({
          where: { id: companyId },
          select: { displayName: true },
        })
        if (company === null) {
          throw new ApiException(
            HttpStatus.UNAUTHORIZED,
            'INVALID_ACCESS_TOKEN',
            'Invalid access token.',
          )
        }

        const existingPassport = await tx.passport.findUnique({
          where: { productId },
          select: {
            id: true,
            publicUuid: true,
            qrTargetUrl: true,
            firstPublishedAt: true,
          },
        })

        // Idempotency: publishing a revision that already produced a version returns
        // that version instead of creating a duplicate. The unique constraint on
        // (passportId, sourceDraftRevision) is what makes this safe under a race.
        if (existingPassport !== null) {
          const replayed = await tx.passportVersion.findUnique({
            where: {
              passportId_sourceDraftRevision: {
                passportId: existingPassport.id,
                sourceDraftRevision: expectedDraftRevision,
              },
            },
            select: { id: true, versionNumber: true, publishedAt: true },
          })

          if (replayed !== null) {
            return toResult(
              {
                passportId: existingPassport.id,
                productId,
                publicUuid: existingPassport.publicUuid,
                versionId: replayed.id,
                versionNumber: replayed.versionNumber,
                sourceDraftRevision: expectedDraftRevision,
                firstPublishedAt: existingPassport.firstPublishedAt,
                publishedAt: replayed.publishedAt,
                qrTargetUrl: existingPassport.qrTargetUrl,
                replayed: true,
              },
              publicAppOrigin,
            )
          }
        }

        // First publication allocates the stable UUID and its QR artifact; republishing
        // keeps both, because a printed QR code must not stop working.
        let passportId: string
        let publicUuid: string
        let qrTargetUrl: string
        let firstPublishedAt: Date

        if (existingPassport === null) {
          publicUuid = randomUUID()
          qrTargetUrl = `${publicAppOrigin}/q/${publicUuid}`
          const qrPngBytes = await renderQrPng(qrTargetUrl)
          firstPublishedAt = new Date()
          const created = await tx.passport.create({
            data: {
              productId,
              publicUuid,
              firstPublishedAt,
              qrTargetUrl,
              qrPngBytes: new Uint8Array(qrPngBytes),
              qrGeneratedAt: new Date(),
            },
            select: { id: true },
          })
          passportId = created.id
        } else {
          passportId = existingPassport.id
          publicUuid = existingPassport.publicUuid
          qrTargetUrl = existingPassport.qrTargetUrl
          firstPublishedAt = existingPassport.firstPublishedAt
        }

        const latest = await tx.passportVersion.findFirst({
          where: { passportId },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        })

        const version = await tx.passportVersion.create({
          data: {
            passportId,
            versionNumber: (latest?.versionNumber ?? 0) + 1,
            sourceDraftRevision: expectedDraftRevision,
            snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
            publicSnapshot: buildSnapshot(draft, {
              displayName: company.displayName,
            }) as unknown as Prisma.InputJsonValue,
            publishedById: actorId,
          },
          select: { id: true, versionNumber: true, publishedAt: true },
        })

        const retained = collectRetainedAssets(draft)
        if (retained.length > 0) {
          await tx.passportVersionAsset.createMany({
            data: retained.map((asset) => ({
              versionId: version.id,
              assetId: asset.assetId,
              role: asset.role,
            })),
          })
        }

        await tx.passport.update({
          where: { id: passportId },
          data: { currentVersionId: version.id },
        })

        // A new immutable version is a real domain mutation, so its audit row commits with
        // it. The replay path returns earlier in this transaction, which is what keeps a
        // repeated publish of an already-published revision from inventing a second
        // publication event, and a failed or incomplete publish from writing one at all.
        await this.audit.record(tx, {
          actorId,
          entityType: AUDIT_ENTITY_TYPES.PASSPORT,
          entityId: passportId,
          action: AUDIT_ACTIONS.PASSPORT_VERSION_PUBLISHED,
          requestId,
          safeMetadata: {
            passportId,
            versionNumber: version.versionNumber,
            sourceDraftRevision: expectedDraftRevision,
          },
        })

        return toResult(
          {
            passportId,
            productId,
            publicUuid,
            versionId: version.id,
            versionNumber: version.versionNumber,
            sourceDraftRevision: expectedDraftRevision,
            firstPublishedAt,
            publishedAt: version.publishedAt,
            qrTargetUrl,
            replayed: false,
          },
          publicAppOrigin,
        )
      })
    } catch (error) {
      if (error instanceof ApiException) {
        throw error
      }
      // A concurrent publish that slipped past the row lock still cannot create a
      // duplicate version; surface it as the same conflict the client already handles.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw publicationRevisionConflict()
      }
      throw error
    }
  }

  private productNotFound(): ApiException {
    return new ApiException(HttpStatus.NOT_FOUND, 'PRODUCT_NOT_FOUND', 'Product not found.')
  }
}
