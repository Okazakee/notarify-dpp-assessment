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
