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

export type CertificationResponse = {
  id: string
  name: string | null
  issuingAuthority: string | null
  issueDate: string | null
  expirationDate: string | null
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
}

export type ProductListResponse = {
  items: ProductListItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}
