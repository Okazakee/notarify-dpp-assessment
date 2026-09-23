import { HttpStatus } from '@nestjs/common'
import { ApiException } from '../common/api-exception.js'
import type { PassportSnapshot, PublishableDraft, RetainedAsset } from './publication.types.js'

/**
 * Publication policy: what a draft must satisfy before it can become an immutable
 * published version, and how that version is projected.
 *
 * Drafts are deliberately allowed to be incomplete, so everything here is a
 * publication prerequisite rather than a save-time rule. The company logo is not a
 * prerequisite: the public passport's brand logo is satisfied by a bundled application
 * asset, so `Company.logoAssetId` is optional and may stay unset.
 */

/** Bump when the shape of `PassportSnapshot` changes. */
export const SNAPSHOT_SCHEMA_VERSION = 1

export function publicationIncomplete(gaps: string[]): ApiException {
  return new ApiException(
    HttpStatus.BAD_REQUEST,
    'PUBLICATION_INCOMPLETE',
    `This product is not ready to publish. Missing or invalid: ${gaps.join('; ')}.`,
  )
}

export function publicationRevisionConflict(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    'PRODUCT_REVISION_CONFLICT',
    'Product draft revision conflict.',
  )
}

/**
 * Returns the reasons a draft cannot be published, in the order a user would fix them.
 *
 * An empty array means the draft is publishable. Messages name the field so the editor
 * can explain a failure in field-level terms.
 */
export function collectPublicationGaps(draft: PublishableDraft): string[] {
  const gaps: string[] = []

  const requiredFields: Array<[string, string | null]> = [
    ['name', draft.name],
    ['sku', draft.sku],
    ['serial number', draft.serialNumber],
    ['category', draft.categoryId],
    ['description', draft.description],
    ['production date', draft.productionDate],
    ['country of origin', draft.originCountry],
  ]
  for (const [label, value] of requiredFields) {
    if (value === null || value.trim().length === 0) {
      gaps.push(label)
    }
  }

  if (draft.sustainability === null) {
    gaps.push('sustainability data')
  }

  if (!draft.images.some((image) => image.role === 'COVER')) {
    gaps.push('cover image')
  }

  if (draft.materials.length > 0) {
    const total = draft.materials.reduce((sum, material) => sum + material.percentage, 0)
    // Percentages are stored to two decimals, so compare at that precision.
    if (Math.abs(total - 100) > 0.005) {
      gaps.push(`material percentages must total 100 (currently ${total})`)
    }
  }

  for (const [index, certification] of draft.certifications.entries()) {
    const label = certification.name?.trim() || `#${index + 1}`
    if (certification.name === null) {
      gaps.push(`certification ${label} name`)
    }
    if (certification.issuingAuthority === null) {
      gaps.push(`certification ${label} issuing authority`)
    }
    if (certification.issueDate === null) {
      gaps.push(`certification ${label} issue date`)
    }
    if (certification.pdfAssetId === null) {
      gaps.push(`certification ${label} PDF`)
    }
  }

  return gaps
}

/**
 * Builds the immutable public projection for a version.
 *
 * Only ids and scalar content are stored. Asset bytes and origin-dependent URLs are
 * deliberately excluded: bytes are served through the asset route under an
 * authorization decision, and the QR target origin lives on `Passport` where it can be
 * regenerated without rewriting history.
 */
export function buildSnapshot(
  draft: PublishableDraft,
  brand: { displayName: string; logoAssetId: string | null },
): PassportSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    product: {
      id: draft.id,
      name: draft.name,
      sku: draft.sku,
      serialNumber: draft.serialNumber,
      description: draft.description,
      productionDate: draft.productionDate,
      originCountry: draft.originCountry,
      categoryId: draft.categoryId,
      categoryName: draft.categoryName,
    },
    brand: {
      displayName: brand.displayName,
      logoAssetId: brand.logoAssetId,
    },
    verification: {
      status: 'VERIFIED',
      basis: 'PROTOTYPE_APPLICATION_LEVEL',
    },
    materials: draft.materials,
    sustainability: draft.sustainability,
    certifications: draft.certifications.map((certification) => ({
      name: certification.name,
      issuingAuthority: certification.issuingAuthority,
      issueDate: certification.issueDate,
      expirationDate: certification.expirationDate,
      pdfAssetId: certification.pdfAssetId,
    })),
    images: draft.images,
    documents: draft.documents,
  }
}

/**
 * Every asset a published version keeps a relational reference to.
 *
 * `PassportVersionAsset` is what stops a snapshot from silently losing its files: a
 * later draft edit that unlinks an image must not break an already-published version.
 */
export function collectRetainedAssets(
  draft: PublishableDraft,
  companyLogoAssetId: string | null,
): RetainedAsset[] {
  const retained: RetainedAsset[] = []

  if (companyLogoAssetId !== null) {
    retained.push({ assetId: companyLogoAssetId, role: 'COMPANY_LOGO' })
  }

  for (const image of draft.images) {
    retained.push({
      assetId: image.assetId,
      role: image.role === 'COVER' ? 'COVER_IMAGE' : 'GALLERY_IMAGE',
    })
  }

  for (const document of draft.documents) {
    retained.push({ assetId: document.assetId, role: 'PRODUCT_DOCUMENT' })
  }

  for (const certification of draft.certifications) {
    if (certification.pdfAssetId !== null) {
      retained.push({ assetId: certification.pdfAssetId, role: 'CERTIFICATION_PDF' })
    }
  }

  // The same asset can legitimately appear in more than one role (for example a PDF
  // used as both a document and a certification attachment). The composite key is
  // (versionId, assetId), so collapse to one row per asset and keep the first role.
  const byAssetId = new Map<string, RetainedAsset>()
  for (const asset of retained) {
    if (!byAssetId.has(asset.assetId)) {
      byAssetId.set(asset.assetId, asset)
    }
  }

  return [...byAssetId.values()]
}
