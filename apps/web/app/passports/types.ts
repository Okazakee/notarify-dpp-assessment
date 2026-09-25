/**
 * Back-office passport contracts.
 *
 * These mirror the authenticated API responses. Each one is validated structurally
 * before rendering, so a malformed response is rejected at the boundary instead of
 * crashing deep inside JSX.
 */

export type PassportProductIdentity = {
  name: string | null
  sku: string | null
  serialNumber: string | null
}

export type PassportListItem = {
  passportId: string
  productId: string
  product: PassportProductIdentity
  publicUuid: string
  status: 'PUBLISHED'
  currentVersionNumber: number
  sourceDraftRevision: number
  currentDraftRevision: number
  hasUnpublishedChanges: boolean
  firstPublishedAt: string
  currentPublishedAt: string
  /** The current public version. Never the selected historical version. */
  publicUrl: string
  qrDownloadUrl: string
  /** The PDF export of the current version. There is no historical PDF. */
  pdfDownloadUrl: string
}

export type PassportListResponse = {
  items: PassportListItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type PassportVersionSummary = {
  versionNumber: number
  publishedAt: string
  sourceDraftRevision: number
  isCurrent: boolean
}

export type PassportVersionsResponse = {
  passport: PassportListItem
  versions: PassportVersionSummary[]
}

export type HistoricalPassportView = {
  passport: {
    passportId: string
    productId: string
    publicUuid: string
    creationDate: string
    version: number
    status: 'PUBLISHED'
    verificationStatus: 'VERIFIED'
    publishedAt: string
    sourceDraftRevision: number
    isCurrent: boolean
    currentVersionNumber: number
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
    originalName: string | null
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
    originalName: string | null
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

function isIdentity(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNullableString(value.name) &&
    isNullableString(value.sku) &&
    isNullableString(value.serialNumber)
  )
}

export function isPassportListItem(value: unknown): value is PassportListItem {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.passportId === 'string' &&
    typeof value.productId === 'string' &&
    isIdentity(value.product) &&
    typeof value.publicUuid === 'string' &&
    value.status === 'PUBLISHED' &&
    typeof value.currentVersionNumber === 'number' &&
    typeof value.sourceDraftRevision === 'number' &&
    typeof value.currentDraftRevision === 'number' &&
    typeof value.hasUnpublishedChanges === 'boolean' &&
    typeof value.firstPublishedAt === 'string' &&
    typeof value.currentPublishedAt === 'string' &&
    typeof value.publicUrl === 'string' &&
    typeof value.qrDownloadUrl === 'string' &&
    typeof value.pdfDownloadUrl === 'string'
  )
}

export function isPassportListResponse(value: unknown): value is PassportListResponse {
  if (!isRecord(value)) {
    return false
  }
  return (
    Array.isArray(value.items) &&
    value.items.every(isPassportListItem) &&
    typeof value.page === 'number' &&
    typeof value.pageSize === 'number' &&
    typeof value.total === 'number' &&
    typeof value.totalPages === 'number'
  )
}

function isVersionSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.versionNumber === 'number' &&
    typeof value.publishedAt === 'string' &&
    typeof value.sourceDraftRevision === 'number' &&
    typeof value.isCurrent === 'boolean'
  )
}

export function isPassportVersionsResponse(value: unknown): value is PassportVersionsResponse {
  if (!isRecord(value)) {
    return false
  }
  return (
    isPassportListItem(value.passport) &&
    Array.isArray(value.versions) &&
    value.versions.every(isVersionSummary)
  )
}

export function isHistoricalPassportView(value: unknown): value is HistoricalPassportView {
  if (!isRecord(value)) {
    return false
  }
  const { passport, brand, product, materials, sustainability, certifications, images } = value
  if (!isRecord(passport) || !isRecord(brand) || !isRecord(product)) {
    return false
  }

  const passportOk =
    typeof passport.passportId === 'string' &&
    typeof passport.productId === 'string' &&
    typeof passport.publicUuid === 'string' &&
    typeof passport.creationDate === 'string' &&
    typeof passport.version === 'number' &&
    passport.status === 'PUBLISHED' &&
    passport.verificationStatus === 'VERIFIED' &&
    typeof passport.publishedAt === 'string' &&
    typeof passport.sourceDraftRevision === 'number' &&
    typeof passport.isCurrent === 'boolean' &&
    typeof passport.currentVersionNumber === 'number'
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
      isNullableString(entry.pdfAssetId) &&
      isNullableString(entry.originalName) &&
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
      typeof entry.assetId === 'string' &&
      typeof entry.kind === 'string' &&
      isNullableString(entry.title) &&
      isNullableString(entry.originalName) &&
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
