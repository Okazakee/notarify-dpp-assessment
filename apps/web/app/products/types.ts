'use client'

export type ProductStatus = 'DRAFT' | 'PUBLISHED'

export type Category = {
  id: string
  stableCode: string
  name: string
}

/** Publication state needed by the product table to render its passport actions. */
export type ProductPassportSummary = {
  publicUuid: string
  publicUrl: string
  qrDownloadUrl: string
  currentVersionNumber: number
  sourceDraftRevision: number
  hasUnpublishedChanges: boolean
  currentPublishedAt: string
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
  /** The current draft cover asset. Bytes stay behind the authenticated asset route. */
  coverImageAssetId: string | null
  passport: ProductPassportSummary | null
}

export type Material = {
  id: string
  name: string
  percentage: number
  originCountry: string | null
  recyclable: boolean | null
  position: number
}

export type Sustainability = {
  carbonKgCo2e: number | null
  waterLitres: number | null
  recycledPercent: number | null
  repairabilityScore: number | null
  recyclable: boolean | null
}

export type AssetSummary = {
  originalName: string
  detectedMime: string
  sizeBytes: number
}

export type Certification = {
  id: string
  name: string | null
  issuingAuthority: string | null
  issueDate: string | null
  expirationDate: string | null
  pdfAssetId: string | null
  pdfAsset: AssetSummary | null
}

export type ImageRole = 'COVER' | 'GALLERY'

export type DocumentKind = 'MANUAL' | 'WARRANTY' | 'TECHNICAL_DATASHEET'

export type ProductImage = {
  id: string
  assetId: string
  role: ImageRole
  position: number
  altText: string | null
  asset: AssetSummary
}

export type ProductDocument = {
  id: string
  assetId: string
  kind: DocumentKind
  title: string | null
  position: number
  asset: AssetSummary
}

export type ProductDetail = ProductListItem & {
  description: string | null
  productionDate: string | null
  originCountry: string | null
  materials: Material[]
  sustainability: Sustainability | null
  certifications: Certification[]
  images: ProductImage[]
  documents: ProductDocument[]
}

export type ProductListResponse = {
  items: ProductListItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type MaterialDraft = {
  clientId: string
  name: string
  percentage: string
  originCountry: string
  recyclable: '' | 'true' | 'false'
}

export type SustainabilityDraft = {
  carbonKgCo2e: string
  waterLitres: string
  recycledPercent: string
  repairabilityScore: string
  recyclable: '' | 'true' | 'false'
}

export type CertificationDraft = {
  clientId: string
  name: string
  issuingAuthority: string
  issueDate: string
  expirationDate: string
  pdfAssetId: string
  pdfOriginalName: string
  pdfSizeBytes: number | null
}

/**
 * An image association held in editor state.
 *
 * `assetId` is already a stored, validated asset: uploading happens as soon as the
 * user picks a file, and saving the product is what links it. An uploaded asset that
 * is never saved stays unlinked, which the milestone explicitly allows.
 */
export type ImageDraft = {
  clientId: string
  assetId: string
  role: ImageRole
  altText: string
  originalName: string
  sizeBytes: number | null
}

export type DocumentDraft = {
  clientId: string
  assetId: string
  kind: DocumentKind
  title: string
  originalName: string
  sizeBytes: number | null
}

export type ProductEditorForm = {
  name: string
  sku: string
  serialNumber: string
  categoryId: string
  description: string
  productionDate: string
  originCountry: string
  materials: MaterialDraft[]
  sustainability: SustainabilityDraft | null
  certifications: CertificationDraft[]
  images: ImageDraft[]
  documents: DocumentDraft[]
}

/** Response of `POST /assets`. Never carries bytes. */
export type AssetUploadResponse = {
  id: string
  originalName: string
  detectedMime: string
  sizeBytes: number
  createdAt: string
}
