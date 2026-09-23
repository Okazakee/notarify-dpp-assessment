/**
 * Publication contracts.
 *
 * A published version is an immutable projection: once written it is never updated,
 * and republishing creates a new version rather than mutating the old one. The
 * snapshot stores asset **ids**, never bytes or origin-dependent URLs, so a stored
 * version stays valid if the public origin later changes.
 */

export type PublishableDraft = {
  id: string
  name: string | null
  sku: string | null
  serialNumber: string | null
  categoryId: string | null
  categoryName: string | null
  description: string | null
  productionDate: string | null
  originCountry: string | null
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
 * Prototype/application-level verification presentation.
 *
 * The assessment needs the badge and the status on a published passport. It is not a
 * review outcome, not authenticity proof, and not ESPR or EU registration, so the
 * snapshot records the basis explicitly and no review subsystem is involved.
 */
export type SnapshotVerification = {
  status: 'VERIFIED'
  basis: 'PROTOTYPE_APPLICATION_LEVEL'
}

export type PassportSnapshot = {
  schemaVersion: number
  product: {
    id: string
    name: string | null
    sku: string | null
    serialNumber: string | null
    description: string | null
    productionDate: string | null
    originCountry: string | null
    categoryId: string | null
    categoryName: string | null
  }
  brand: {
    displayName: string
    logoAssetId: string | null
  }
  verification: SnapshotVerification
  materials: PublishableDraft['materials']
  sustainability: PublishableDraft['sustainability']
  certifications: Array<{
    name: string | null
    issuingAuthority: string | null
    issueDate: string | null
    expirationDate: string | null
    pdfAssetId: string | null
  }>
  images: PublishableDraft['images']
  documents: PublishableDraft['documents']
}

/** One asset the published version retains a relational reference to. */
export type RetainedAsset = {
  assetId: string
  role: 'COMPANY_LOGO' | 'COVER_IMAGE' | 'GALLERY_IMAGE' | 'PRODUCT_DOCUMENT' | 'CERTIFICATION_PDF'
}

export type PublicationResult = {
  passportId: string
  publicUuid: string
  versionId: string
  versionNumber: number
  sourceDraftRevision: number
  publishedAt: string
  qrTargetUrl: string
  /** True when this call returned a version that already existed for that revision. */
  replayed: boolean
}
