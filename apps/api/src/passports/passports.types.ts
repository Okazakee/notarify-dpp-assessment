/**
 * Back-office passport contracts.
 *
 * These are authenticated, company-scoped views of published passports and their
 * retained versions. They are deliberately distinct from the anonymous `PassportView`:
 * a historical version is not what `/passport/:uuid` serves, so this projection never
 * presents the public URL or QR download as if they belonged to the selected version.
 */

/** Product identity as it was published, never as the mutable draft currently reads. */
export type PassportProductIdentity = {
  name: string | null
  sku: string | null
  serialNumber: string | null
}

/**
 * One passport row for the back-office list.
 *
 * `status` means an active published passport. Withdrawal is implemented — deleting a
 * product withdraws its passport — and a withdrawn passport leaves this list rather than
 * gaining a second writable status field.
 */
export type PassportListItem = {
  passportId: string
  productId: string
  product: PassportProductIdentity
  publicUuid: string
  status: 'PUBLISHED'
  currentVersionNumber: number
  /** Draft revision the current immutable version was published from. */
  sourceDraftRevision: number
  /** Draft revision the product currently carries. */
  currentDraftRevision: number
  /** `currentDraftRevision > sourceDraftRevision`: saved edits are not published yet. */
  hasUnpublishedChanges: boolean
  firstPublishedAt: string
  currentPublishedAt: string
  /** Always the current public version. Never a selected historical version. */
  publicUrl: string
  /** The passport-level QR artifact. One QR per passport, stable across versions. */
  qrDownloadUrl: string
  /** The PDF export of the same current version, for both roles. */
  pdfDownloadUrl: string
}

export type PassportListResponse = {
  items: PassportListItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type PassportVersionListItem = {
  versionNumber: number
  publishedAt: string
  sourceDraftRevision: number
  isCurrent: boolean
}

/**
 * The version-history payload: passport metadata plus every retained version.
 *
 * The passport block describes the *current* publication, so the page can label history
 * honestly ("the public URL currently shows vM") without a second request.
 */
export type PassportVersionsResponse = {
  passport: PassportListItem
  versions: PassportVersionListItem[]
}

export type HistoricalAssetView = {
  assetId: string
  url: string
}

/**
 * The immutable snapshot of one retained version.
 *
 * Asset URLs point at the authenticated historical-asset route for this exact version,
 * because those bytes are private. There is no public URL or QR field here: both belong
 * to the passport's current version, and offering them under a historical version would
 * misrepresent what the anonymous route serves.
 */
export type HistoricalPassportView = {
  passport: {
    passportId: string
    productId: string
    publicUuid: string
    creationDate: string
    version: number
    status: 'PUBLISHED'
    /** Prototype/application-level presentation, identical to the public page. */
    verificationStatus: 'VERIFIED'
    publishedAt: string
    sourceDraftRevision: number
    isCurrent: boolean
    currentVersionNumber: number
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
    /** Stored original filename, for display and download naming only. */
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
    /** Stored original filename, for display and download naming only. */
    originalName: string | null
    downloadUrl: string
  }>
}
