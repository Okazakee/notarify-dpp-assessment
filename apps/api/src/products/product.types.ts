export type ProductStatus = 'DRAFT' | 'PUBLISHED'

export type MaterialResponse = {
  id: string
  name: string
  percentage: number
  originCountry: string | null
  recyclable: boolean | null
  position: number
}

export type SustainabilityResponse = {
  carbonKgCo2e: number | null
  waterLitres: number | null
  recycledPercent: number | null
  repairabilityScore: number | null
  recyclable: boolean | null
}

/**
 * Display metadata for a linked asset.
 *
 * Bytes are never included here: the editor fetches them from `GET /assets/:id`,
 * which keeps binary content out of product JSON entirely.
 */
export type AssetSummary = {
  originalName: string
  detectedMime: string
  sizeBytes: number
}

export type CertificationResponse = {
  id: string
  name: string | null
  issuingAuthority: string | null
  issueDate: string | null
  expirationDate: string | null
  pdfAssetId: string | null
  pdfAsset: AssetSummary | null
}

export type ProductImageResponse = {
  id: string
  assetId: string
  role: 'COVER' | 'GALLERY'
  position: number
  altText: string | null
  asset: AssetSummary
}

export type ProductDocumentResponse = {
  id: string
  assetId: string
  kind: 'MANUAL' | 'WARRANTY' | 'TECHNICAL_DATASHEET'
  title: string | null
  position: number
  asset: AssetSummary
}

export type ProductListItem = {
  id: string
  name: string | null
  sku: string | null
  serialNumber: string | null
  categoryId: string | null
  categoryName: string | null
  status: ProductStatus
  draftRevision: number
  createdAt: string
  updatedAt: string
  /**
   * The current draft cover asset, or `null`.
   *
   * Only the id is exposed; the bytes stay behind the authenticated `GET /assets/:id`
   * route, so the list never carries binary content and a draft cover never becomes
   * public through a list response.
   */
  coverImageAssetId: string | null
  /**
   * Non-synthetic views of the currently active Passport, or `0`.
   *
   * A product that has never been published, and a published product nobody has viewed,
   * both report `0` — after Stage 5 that is a measured value rather than a placeholder.
   * A QR scan does not count: this metric is views only.
   */
  totalViews: number
  /**
   * Current publication metadata, or `null` when the product has never been published.
   *
   * This is fetched with the list query itself, never one request per row. The identity
   * of what is published lives on the passport list; this block is only what the product
   * table needs to render its publication actions and state.
   */
  passport: {
    publicUuid: string
    publicUrl: string
    qrDownloadUrl: string
    currentVersionNumber: number
    sourceDraftRevision: number
    hasUnpublishedChanges: boolean
    currentPublishedAt: string
  } | null
}

export type ProductDetail = ProductListItem & {
  description: string | null
  productionDate: string | null
  originCountry: string | null
  materials: MaterialResponse[]
  sustainability: SustainabilityResponse | null
  certifications: CertificationResponse[]
  images: ProductImageResponse[]
  documents: ProductDocumentResponse[]
}

export type ProductListResponse = {
  items: ProductListItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}
