import { HttpStatus } from '@nestjs/common'
import { ApiException } from '../common/api-exception.js'
import { SNAPSHOT_SCHEMA_VERSION } from './publication.policy.js'
import type { PassportSnapshot } from './publication.types.js'

/**
 * The single validated interpretation of a stored snapshot.
 *
 * Two read surfaces project the same immutable snapshot: the anonymous public passport
 * and the authenticated back-office version history. They differ only in the URLs they
 * attach, so the interpretation itself lives here, once, instead of being duplicated in
 * a second projection that could drift from the first.
 *
 * `buildPassportContent` returns content only. It knows nothing about the public UUID,
 * the public origin or the route a version is read through, because none of those are
 * properties of the stored snapshot.
 */

export type PassportContent = {
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
  }>
  images: Array<{
    assetId: string
    role: 'COVER' | 'GALLERY'
    position: number
    altText: string | null
  }>
  documents: Array<{
    assetId: string
    kind: string
    title: string | null
    position: number
  }>
}

/**
 * A stored snapshot this API cannot project.
 *
 * Reported as a plain server-side failure with no detail, so a corrupt or
 * newer-than-supported snapshot cannot leak raw JSON or database information.
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
  if (value.sustainability !== null && !isRecord(value.sustainability)) {
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

  // Every element is checked too, so a structurally corrupt entry fails as the intended
  // controlled error rather than as a TypeError from a projection below.
  for (const list of [value.materials, value.certifications, value.images, value.documents]) {
    for (const entry of list) {
      if (!isRecord(entry)) {
        throw passportUnavailable()
      }
    }
  }

  return value as unknown as PassportSnapshot
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

export function buildPassportContent(input: { snapshot: unknown }): PassportContent {
  const snapshot = parseSnapshot(input.snapshot)

  return {
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
    // Projected field by field rather than echoed, so a stored value of the wrong shape
    // cannot pass through under a type that declares five scalars.
    sustainability:
      snapshot.sustainability === null
        ? null
        : {
            carbonKgCo2e: numberOrNull(snapshot.sustainability.carbonKgCo2e),
            waterLitres: numberOrNull(snapshot.sustainability.waterLitres),
            recycledPercent: numberOrNull(snapshot.sustainability.recycledPercent),
            repairabilityScore: numberOrNull(snapshot.sustainability.repairabilityScore),
            recyclable: booleanOrNull(snapshot.sustainability.recyclable),
          },
    certifications: snapshot.certifications.map((certification) => ({
      name: certification.name,
      issuingAuthority: certification.issuingAuthority,
      issueDate: certification.issueDate,
      expirationDate: certification.expirationDate,
      pdfAssetId: certification.pdfAssetId,
    })),
    images: snapshot.images.map((image) => ({
      assetId: image.assetId,
      role: image.role,
      position: image.position,
      altText: image.altText,
    })),
    documents: snapshot.documents.map((document) => ({
      assetId: document.assetId,
      kind: document.kind,
      title: document.title,
      position: document.position,
    })),
  }
}

/**
 * The published identity a back-office list shows for a passport.
 *
 * A Passport row describes what is actually published, so its product name, SKU and
 * serial come from the immutable current snapshot and not from the mutable `Product`
 * draft, which may already carry unpublished edits. A snapshot this API cannot read
 * yields `null` rather than a controlled error, because one unreadable row must not
 * make the whole passport list unservable; the caller renders an empty identity.
 */
export type PassportIdentity = {
  name: string | null
  sku: string | null
  serialNumber: string | null
}

export function readPassportIdentity(snapshot: unknown): PassportIdentity | null {
  try {
    const content = buildPassportContent({ snapshot })
    return {
      name: content.product.name,
      sku: content.product.sku,
      serialNumber: content.product.serialNumber,
    }
  } catch {
    return null
  }
}
