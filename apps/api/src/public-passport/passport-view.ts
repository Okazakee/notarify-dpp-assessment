import { HttpStatus } from '@nestjs/common'
import { ApiException } from '../common/api-exception.js'
import { SNAPSHOT_SCHEMA_VERSION } from '../publication/publication.policy.js'
import type { PassportSnapshot } from '../publication/publication.types.js'

/**
 * The anonymous public projection.
 *
 * This is the single API-owned contract for published content, and it is deliberately
 * built **only** from the immutable `PassportVersion` snapshot. Live draft rows never
 * contribute content, so an unpublished edit cannot appear here; the mutable `Product`
 * row participates in visibility checks alone.
 *
 * It exposes no internal identifiers: the public UUID is the passport identity, and
 * company, publisher and draft-revision details stay private. Asset URLs are
 * API-relative, because the API does not need to know its own public origin to describe
 * its own routes; page URLs are absolute because they are browser-facing.
 */

export type PassportViewAssetRef = {
  assetId: string
  url: string
}

export type PassportView = {
  passport: {
    publicUuid: string
    creationDate: string
    version: number
    status: 'PUBLISHED'
    /** Prototype/application-level presentation. Not a review outcome or certification. */
    verificationStatus: 'VERIFIED'
    publishedAt: string
    publicUrl: string
    qrTargetUrl: string
    qrDownloadUrl: string
  }
  brand: {
    displayName: string
  }
  product: {
    name: string | null
    sku: string | null
    serialNumber: string | null
    description: string | null
    productionDate: string | null
    originCountry: string | null
    categoryName: string | null
  }
  materials: Array<{
    name: string
    percentage: number
    originCountry: string | null
    recyclable: boolean | null
    position: number
  }>
  sustainability: {
    carbonKgCo2e: number | null
    waterLitres: number | null
    recycledPercent: number | null
    repairabilityScore: number | null
    recyclable: boolean | null
  } | null
  certifications: Array<{
    name: string | null
    issuingAuthority: string | null
    issueDate: string | null
    expirationDate: string | null
    pdfAssetId: string | null
    downloadUrl: string | null
  }>
  images: Array<{
    assetId: string
    role: 'COVER' | 'GALLERY'
    position: number
    altText: string | null
    url: string
  }>
  documents: Array<{
    assetId: string
    kind: string
    title: string | null
    position: number
    downloadUrl: string
  }>
}

/**
 * The single anonymous not-found response.
 *
 * Malformed UUID, unknown passport, unpublished passport, withdrawn passport and
 * soft-deleted product all return exactly this, so the public surface cannot be used to
 * learn whether a passport exists.
 */
export function passportNotFound(): ApiException {
  return new ApiException(HttpStatus.NOT_FOUND, 'PASSPORT_NOT_FOUND', 'Passport not found.')
}

/**
 * A stored snapshot this API cannot project.
 *
 * Reported as a plain server-side failure with no detail, so a corrupt or
 * newer-than-supported snapshot cannot leak raw JSON or database information to an
 * anonymous caller.
 */
export function passportUnavailable(): ApiException {
  return new ApiException(
    HttpStatus.INTERNAL_SERVER_ERROR,
    'PASSPORT_UNAVAILABLE',
    'This passport could not be read.',
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validates a stored snapshot against the supported schema version.
 *
 * Only version 1 is supported. A generic versioning framework is deliberately not
 * introduced: an unrecognised version is simply unreadable here, which is the honest
 * outcome until a second version exists to migrate between.
 */
function parseSnapshot(value: unknown): PassportSnapshot {
  if (!isRecord(value) || value.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw passportUnavailable()
  }
  if (!isRecord(value.product) || !isRecord(value.brand)) {
    throw passportUnavailable()
  }
  if (
    !Array.isArray(value.materials) ||
    !Array.isArray(value.certifications) ||
    !Array.isArray(value.images) ||
    !Array.isArray(value.documents)
  ) {
    throw passportUnavailable()
  }

  return value as unknown as PassportSnapshot
}

function assetUrl(publicUuid: string, assetId: string): string {
  return `/passport/${publicUuid}/assets/${assetId}`
}

export function buildPassportView(input: {
  snapshot: unknown
  publicUuid: string
  versionNumber: number
  firstPublishedAt: Date
  publishedAt: Date
  publicAppOrigin: string
}): PassportView {
  const snapshot = parseSnapshot(input.snapshot)
  const { publicUuid, publicAppOrigin } = input

  return {
    passport: {
      publicUuid,
      creationDate: input.firstPublishedAt.toISOString(),
      version: input.versionNumber,
      status: 'PUBLISHED',
      verificationStatus: 'VERIFIED',
      publishedAt: input.publishedAt.toISOString(),
      publicUrl: `${publicAppOrigin}/passport/${publicUuid}`,
      qrTargetUrl: `${publicAppOrigin}/q/${publicUuid}`,
      qrDownloadUrl: `/passport/${publicUuid}/qr.png`,
    },
    brand: {
      displayName: snapshot.brand.displayName,
    },
    product: {
      name: snapshot.product.name,
      sku: snapshot.product.sku,
      serialNumber: snapshot.product.serialNumber,
      description: snapshot.product.description,
      productionDate: snapshot.product.productionDate,
      originCountry: snapshot.product.originCountry,
      categoryName: snapshot.product.categoryName,
    },
    materials: snapshot.materials.map((material) => ({
      name: material.name,
      percentage: material.percentage,
      originCountry: material.originCountry,
      recyclable: material.recyclable,
      position: material.position,
    })),
    sustainability: snapshot.sustainability,
    certifications: snapshot.certifications.map((certification) => ({
      name: certification.name,
      issuingAuthority: certification.issuingAuthority,
      issueDate: certification.issueDate,
      expirationDate: certification.expirationDate,
      pdfAssetId: certification.pdfAssetId,
      downloadUrl:
        certification.pdfAssetId === null ? null : assetUrl(publicUuid, certification.pdfAssetId),
    })),
    images: snapshot.images.map((image) => ({
      assetId: image.assetId,
      role: image.role,
      position: image.position,
      altText: image.altText,
      url: assetUrl(publicUuid, image.assetId),
    })),
    documents: snapshot.documents.map((document) => ({
      assetId: document.assetId,
      kind: document.kind,
      title: document.title,
      position: document.position,
      downloadUrl: assetUrl(publicUuid, document.assetId),
    })),
  }
}
