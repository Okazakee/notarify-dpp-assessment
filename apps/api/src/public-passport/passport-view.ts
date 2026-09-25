import { HttpStatus } from '@nestjs/common'
import { ApiException } from '../common/api-exception.js'
import type { PassportContent } from '../publication/passport-snapshot-content.js'

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
 *
 * The snapshot interpretation itself is shared with the authenticated version-history
 * projection — see `publication/passport-snapshot-content.ts`. This file only attaches
 * the URLs that belong to the *current* public version.
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
    /**
     * The exported PDF of this same current version. API-relative, like the QR
     * download, so the API does not need to know its own origin.
     */
    pdfDownloadUrl: string
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

function assetUrl(publicUuid: string, assetId: string): string {
  return `/passport/${publicUuid}/assets/${assetId}`
}

export function buildPassportView(input: {
  content: PassportContent
  publicUuid: string
  versionNumber: number
  firstPublishedAt: Date
  publishedAt: Date
  publicAppOrigin: string
}): PassportView {
  const content = input.content
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
      pdfDownloadUrl: `/passport/${publicUuid}/pdf`,
    },
    brand: content.brand,
    product: content.product,
    materials: content.materials,
    sustainability: content.sustainability,
    certifications: content.certifications.map((certification) => ({
      ...certification,
      downloadUrl:
        certification.pdfAssetId === null ? null : assetUrl(publicUuid, certification.pdfAssetId),
    })),
    images: content.images.map((image) => ({
      ...image,
      url: assetUrl(publicUuid, image.assetId),
    })),
    documents: content.documents.map((document) => ({
      ...document,
      downloadUrl: assetUrl(publicUuid, document.assetId),
    })),
  }
}
