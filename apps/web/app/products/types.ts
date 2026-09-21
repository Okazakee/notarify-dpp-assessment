'use client'

export type ProductStatus = 'DRAFT' | 'PUBLISHED'

export type Category = {
  id: string
  stableCode: string
  name: string
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

export type Certification = {
  id: string
  name: string | null
  issuingAuthority: string | null
  issueDate: string | null
  expirationDate: string | null
}

export type ProductDetail = ProductListItem & {
  description: string | null
  productionDate: string | null
  originCountry: string | null
  materials: Material[]
  sustainability: Sustainability | null
  certifications: Certification[]
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
}
