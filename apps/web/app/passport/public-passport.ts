import { API_ORIGIN, apiUrl } from '../api-origin'
import type { PassportDocumentKind, PassportPresentationModel } from './presentation'

/**
 * The anonymous public passport adapter.
 *
 * `PassportView` is the authoritative public API contract. This module mirrors just
 * enough of it to validate an anonymous response before rendering, and converts it into
 * the shared presentation model. It is server-safe and performs no caching of its own:
 * every public response is `no-store`, so the page always reflects the current published
 * version.
 */

export type PassportView = {
  passport: {
    publicUuid: string
    creationDate: string
    version: number
    status: 'PUBLISHED'
    verificationStatus: 'VERIFIED'
    publishedAt: string
    publicUrl: string
    qrTargetUrl: string
    qrDownloadUrl: string
  }
  brand: { displayName: string }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === 'boolean'
}

function isArrayOf(value: unknown, check: (entry: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(check)
}

/**
 * A deliberately shallow structural guard.
 *
 * It is not a reimplementation of the backend snapshot rules; its only job is to reject a
 * response that is obviously not a `PassportView` so the page cannot crash deep inside
 * JSX on `undefined`. Anything that passes still renders through the same null-safe
 * presentation component.
 */
export function isPassportView(value: unknown): value is PassportView {
  if (!isRecord(value)) {
    return false
  }

  const { passport, brand, product, materials, sustainability, certifications, images } = value
  if (!isRecord(passport) || !isRecord(brand) || !isRecord(product)) {
    return false
  }

  const passportOk =
    typeof passport.publicUuid === 'string' &&
    typeof passport.creationDate === 'string' &&
    typeof passport.version === 'number' &&
    typeof passport.publishedAt === 'string' &&
    typeof passport.publicUrl === 'string' &&
    typeof passport.qrDownloadUrl === 'string'
  if (!passportOk || typeof brand.displayName !== 'string') {
    return false
  }

  const productOk =
    isNullableString(product.name) &&
    isNullableString(product.sku) &&
    isNullableString(product.serialNumber) &&
    isNullableString(product.description) &&
    isNullableString(product.productionDate) &&
    isNullableString(product.originCountry) &&
    isNullableString(product.categoryName)
  if (!productOk) {
    return false
  }

  const materialsOk = isArrayOf(
    materials,
    (entry) =>
      isRecord(entry) &&
      typeof entry.name === 'string' &&
      typeof entry.percentage === 'number' &&
      isNullableString(entry.originCountry) &&
      isNullableBoolean(entry.recyclable),
  )
  const certificationsOk = isArrayOf(
    certifications,
    (entry) =>
      isRecord(entry) &&
      isNullableString(entry.name) &&
      isNullableString(entry.issuingAuthority) &&
      isNullableString(entry.issueDate) &&
      isNullableString(entry.expirationDate) &&
      isNullableString(entry.downloadUrl),
  )
  const imagesOk = isArrayOf(
    images,
    (entry) =>
      isRecord(entry) &&
      typeof entry.assetId === 'string' &&
      (entry.role === 'COVER' || entry.role === 'GALLERY') &&
      isNullableString(entry.altText) &&
      typeof entry.url === 'string',
  )
  const documentsOk = isArrayOf(
    value.documents,
    (entry) =>
      isRecord(entry) &&
      typeof entry.kind === 'string' &&
      isNullableString(entry.title) &&
      typeof entry.downloadUrl === 'string',
  )
  const sustainabilityOk =
    sustainability === null ||
    (isRecord(sustainability) &&
      isNullableNumber(sustainability.carbonKgCo2e) &&
      isNullableNumber(sustainability.waterLitres) &&
      isNullableNumber(sustainability.recycledPercent) &&
      isNullableNumber(sustainability.repairabilityScore) &&
      isNullableBoolean(sustainability.recyclable))

  return materialsOk && certificationsOk && imagesOk && documentsOk && sustainabilityOk
}

function toDocumentKind(kind: string): PassportDocumentKind {
  return kind === 'WARRANTY' || kind === 'TECHNICAL_DATASHEET' ? kind : 'MANUAL'
}

export function toPublicPresentationModel(view: PassportView): PassportPresentationModel {
  return {
    passport: {
      publicUuid: view.passport.publicUuid,
      creationDate: view.passport.creationDate,
      version: view.passport.version,
      publishedAt: view.passport.publishedAt,
      status: 'PUBLISHED',
      verificationStatus: 'VERIFIED',
      publicUrl: view.passport.publicUrl,
      qrDownloadUrl: apiUrl(view.passport.qrDownloadUrl),
    },
    brand: { displayName: view.brand.displayName },
    product: view.product,
    materials: view.materials.map((material) => ({
      key: `material-${material.position}`,
      name: material.name,
      percentage: material.percentage,
      originCountry: material.originCountry,
      recyclable: material.recyclable,
    })),
    sustainability: view.sustainability,
    certifications: view.certifications.map((certification) => ({
      // A published certification always carries a PDF asset id, because publication
      // requires one; the name fallback only protects the key against a malformed snapshot.
      key: `certification-${certification.pdfAssetId ?? certification.name ?? 'unknown'}`,
      name: certification.name,
      issuingAuthority: certification.issuingAuthority,
      issueDate: certification.issueDate,
      expirationDate: certification.expirationDate,
      // Published asset bytes are served by the API origin, never by the web origin and
      // never through the authenticated /assets route.
      fileHref: certification.downloadUrl === null ? null : apiUrl(certification.downloadUrl),
      fileName: null,
    })),
    documents: view.documents.map((document) => ({
      key: `document-${document.assetId}`,
      kind: toDocumentKind(document.kind),
      title: document.title,
      fileHref: apiUrl(document.downloadUrl),
      fileName: null,
    })),
    images: view.images.map((image) => ({
      assetId: image.assetId,
      role: image.role,
      altText: image.altText,
      src: apiUrl(image.url),
    })),
  }
}

export type PublicPassportResult =
  | { kind: 'ok'; model: PassportPresentationModel }
  | { kind: 'not-found' }
  | { kind: 'unavailable' }

/**
 * Reads the current published projection anonymously.
 *
 * Every failure the API can produce for this route is collapsed deliberately: the caller
 * learns only "not found" or "unavailable", so the page cannot be used to probe whether a
 * passport exists, was withdrawn or was deleted.
 */
export async function fetchPublicPassport(publicUuid: string): Promise<PublicPassportResult> {
  let response: Response
  try {
    response = await fetch(`${API_ORIGIN}/passport/${encodeURIComponent(publicUuid)}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })
  } catch {
    return { kind: 'unavailable' }
  }

  if (response.status === 404) {
    return { kind: 'not-found' }
  }
  if (!response.ok) {
    return { kind: 'unavailable' }
  }

  const payload: unknown = await response.json().catch(() => null)
  if (!isPassportView(payload)) {
    return { kind: 'unavailable' }
  }

  return { kind: 'ok', model: toPublicPresentationModel(payload) }
}
