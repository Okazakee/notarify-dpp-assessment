'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../auth-context'
import { LogoutButton } from '../../logout-button'
import {
  type DraftPreviewPublication,
  toDraftPresentationModel,
} from '../../passport/draft-preview'
import { DOCUMENT_KIND_LABELS, PassportPresentation } from '../../passport/presentation'
import { useAssetObjectUrls } from '../../passport/use-asset-object-urls'
import {
  type AuthenticatedRequest,
  describeApiError,
  fetchAssetObjectUrl,
  ProductApiError,
  readApiResponse,
  uploadAsset,
} from '../api'
import type {
  AssetUploadResponse,
  Category,
  Certification,
  CertificationDraft,
  DocumentDraft,
  DocumentKind,
  ImageDraft,
  ImageRole,
  Material,
  MaterialDraft,
  ProductDetail,
  ProductDocument,
  ProductEditorForm,
  ProductImage,
  ProductStatus,
  Sustainability,
  SustainabilityDraft,
} from '../types'

/** Attachment limits mirrored from the API so the editor can give immediate feedback. */
const MAX_GALLERY_IMAGES = 12
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'
const PDF_ACCEPT = 'application/pdf'

// Document-kind labels live with the shared presentation contract, so the editor and the
// public passport page can never disagree about what a kind is called.
const DOCUMENT_KINDS: DocumentKind[] = ['MANUAL', 'WARRANTY', 'TECHNICAL_DATASHEET']

const EMPTY_FORM: ProductEditorForm = {
  name: '',
  sku: '',
  serialNumber: '',
  categoryId: '',
  description: '',
  productionDate: '',
  originCountry: '',
  materials: [],
  sustainability: null,
  certifications: [],
  images: [],
  documents: [],
}

/**
 * The seven assessment-required editor tabs, in the required order.
 *
 * Each panel keeps the markup it already had; only the visible tab travels. Inactive
 * panels are hidden rather than unmounted, so switching tabs can never lose entered data
 * and can never trigger a save.
 */
type EditorTab =
  | 'general'
  | 'materials'
  | 'sustainability'
  | 'certifications'
  | 'documents'
  | 'images'
  | 'preview'

const EDITOR_TABS: Array<{ id: EditorTab; label: string }> = [
  { id: 'general', label: 'General Information' },
  { id: 'materials', label: 'Materials' },
  { id: 'sustainability', label: 'Sustainability' },
  { id: 'certifications', label: 'Certifications' },
  { id: 'documents', label: 'Documents' },
  { id: 'images', label: 'Images' },
  { id: 'preview', label: 'Preview' },
]

/**
 * Maps a publication gap named by the API onto the tab that owns that field.
 *
 * Ordered most-specific first: a gap such as "certification 1 name" must resolve to
 * Certifications, not to the General Information rule that also matches `name`.
 */
const PUBLICATION_GAP_TABS: Array<{ match: RegExp; tab: EditorTab }> = [
  { match: /certification/i, tab: 'certifications' },
  { match: /material/i, tab: 'materials' },
  { match: /sustainability/i, tab: 'sustainability' },
  { match: /cover image/i, tab: 'images' },
  {
    match: /name|sku|serial|category|description|production date|country of origin/i,
    tab: 'general',
  },
]

function firstTabForPublicationGaps(message: string): EditorTab | null {
  for (const rule of PUBLICATION_GAP_TABS) {
    if (rule.match.test(message)) {
      return rule.tab
    }
  }
  return null
}

function EditorTabList({ tab, onSelect }: { tab: EditorTab; onSelect: (next: EditorTab) => void }) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])

  function selectAt(index: number) {
    const entry = EDITOR_TABS[index]
    if (entry === undefined) {
      return
    }
    onSelect(entry.id)
    buttonRefs.current[index]?.focus()
  }

  function move(delta: number) {
    const current = EDITOR_TABS.findIndex((entry) => entry.id === tab)
    selectAt((current + delta + EDITOR_TABS.length) % EDITOR_TABS.length)
  }

  return (
    <div
      role="tablist"
      aria-label="Product editor sections"
      aria-orientation="horizontal"
      className="mt-6 flex flex-wrap gap-1 rounded-box border border-base-300 bg-base-100 p-1"
    >
      {EDITOR_TABS.map((entry, index) => {
        const selected = entry.id === tab
        return (
          <button
            key={entry.id}
            ref={(node) => {
              buttonRefs.current[index] = node
            }}
            // Never a submit button: these live above the draft form and must not save it.
            type="button"
            role="tab"
            id={`tab-${entry.id}`}
            aria-selected={selected}
            aria-controls={`panel-${entry.id}`}
            tabIndex={selected ? 0 : -1}
            data-testid={`editor-tab-${entry.id}`}
            onClick={() => onSelect(entry.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                event.preventDefault()
                move(1)
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault()
                move(-1)
              } else if (event.key === 'Home') {
                event.preventDefault()
                selectAt(0)
              } else if (event.key === 'End') {
                event.preventDefault()
                selectAt(EDITOR_TABS.length - 1)
              }
            }}
            className={`btn btn-sm min-w-0 flex-1 whitespace-nowrap focus:outline-2 focus:outline-offset-2 focus:outline-primary ${
              selected ? 'btn-primary' : 'btn-ghost'
            }`}
          >
            {entry.label}
          </button>
        )
      })}
    </div>
  )
}

type ConflictState = {
  message: string
}

type SavePayload = {
  name: string | null
  sku: string | null
  serialNumber: string | null
  categoryId: string | null
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
    role: ImageRole
    position: number
    altText: string | null
  }>
  documents: Array<{
    assetId: string
    kind: DocumentKind
    title: string | null
    position: number
  }>
}

function isCategory(value: unknown): value is Category {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<Category>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.stableCode === 'string' &&
    typeof candidate.name === 'string'
  )
}

function isProductDetail(value: unknown): value is ProductDetail {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<ProductDetail>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.draftRevision === 'number' &&
    (candidate.name === null || typeof candidate.name === 'string') &&
    (candidate.sku === null || typeof candidate.sku === 'string') &&
    (candidate.serialNumber === null || typeof candidate.serialNumber === 'string') &&
    (candidate.categoryId === null || typeof candidate.categoryId === 'string') &&
    (candidate.description === null || typeof candidate.description === 'string') &&
    (candidate.productionDate === null || typeof candidate.productionDate === 'string') &&
    (candidate.originCountry === null || typeof candidate.originCountry === 'string') &&
    Array.isArray(candidate.materials) &&
    Array.isArray(candidate.certifications) &&
    Array.isArray(candidate.images) &&
    Array.isArray(candidate.documents) &&
    (candidate.sustainability === null || typeof candidate.sustainability === 'object')
  )
}

type PublishResult = {
  publicUuid: string
  versionNumber: number
  publicUrl: string
  publishedAt: string
  firstPublishedAt: string
  replayed: boolean
}

function isPublishResult(value: unknown): value is PublishResult {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<PublishResult>
  return (
    typeof candidate.publicUuid === 'string' &&
    typeof candidate.versionNumber === 'number' &&
    typeof candidate.publicUrl === 'string' &&
    typeof candidate.publishedAt === 'string' &&
    typeof candidate.firstPublishedAt === 'string' &&
    typeof candidate.replayed === 'boolean'
  )
}

function isMaterial(value: unknown): value is Material {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<Material>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.percentage === 'number' &&
    (candidate.originCountry === null || typeof candidate.originCountry === 'string') &&
    (candidate.recyclable === null || typeof candidate.recyclable === 'boolean') &&
    typeof candidate.position === 'number'
  )
}

function isSustainability(value: unknown): value is Sustainability {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<Sustainability>
  return (
    (candidate.carbonKgCo2e === null || typeof candidate.carbonKgCo2e === 'number') &&
    (candidate.waterLitres === null || typeof candidate.waterLitres === 'number') &&
    (candidate.recycledPercent === null || typeof candidate.recycledPercent === 'number') &&
    (candidate.repairabilityScore === null || typeof candidate.repairabilityScore === 'number') &&
    (candidate.recyclable === null || typeof candidate.recyclable === 'boolean')
  )
}

function isAssetSummary(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as { originalName?: unknown; detectedMime?: unknown; sizeBytes?: unknown }
  return (
    typeof candidate.originalName === 'string' &&
    typeof candidate.detectedMime === 'string' &&
    typeof candidate.sizeBytes === 'number'
  )
}

function isCertification(value: unknown): value is Certification {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<Certification>
  return (
    typeof candidate.id === 'string' &&
    (candidate.name === null || typeof candidate.name === 'string') &&
    (candidate.issuingAuthority === null || typeof candidate.issuingAuthority === 'string') &&
    (candidate.issueDate === null || typeof candidate.issueDate === 'string') &&
    (candidate.expirationDate === null || typeof candidate.expirationDate === 'string') &&
    (candidate.pdfAssetId === null || typeof candidate.pdfAssetId === 'string') &&
    (candidate.pdfAsset === null || isAssetSummary(candidate.pdfAsset))
  )
}

function isProductImage(value: unknown): value is ProductImage {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<ProductImage>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.assetId === 'string' &&
    (candidate.role === 'COVER' || candidate.role === 'GALLERY') &&
    typeof candidate.position === 'number' &&
    (candidate.altText === null || typeof candidate.altText === 'string') &&
    isAssetSummary(candidate.asset)
  )
}

function isProductDocument(value: unknown): value is ProductDocument {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<ProductDocument>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.assetId === 'string' &&
    (candidate.kind === 'MANUAL' ||
      candidate.kind === 'WARRANTY' ||
      candidate.kind === 'TECHNICAL_DATASHEET') &&
    typeof candidate.position === 'number' &&
    (candidate.title === null || typeof candidate.title === 'string') &&
    isAssetSummary(candidate.asset)
  )
}

function toDateInput(value: string | null): string {
  return value === null ? '' : value.slice(0, 10)
}

function nullableText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function nullableNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }
  return Number(trimmed)
}

function booleanValue(value: '' | 'true' | 'false'): boolean | null {
  return value === '' ? null : value === 'true'
}

function booleanInput(value: boolean | null): '' | 'true' | 'false' {
  return value === null ? '' : value ? 'true' : 'false'
}

function fromMaterial(material: Material, index: number): MaterialDraft {
  return {
    clientId: material.id || `material-${index}`,
    name: material.name,
    percentage: String(material.percentage),
    originCountry: material.originCountry ?? '',
    recyclable: booleanInput(material.recyclable),
  }
}

function fromCertification(certification: Certification, index: number): CertificationDraft {
  return {
    clientId: certification.id || `certification-${index}`,
    name: certification.name ?? '',
    issuingAuthority: certification.issuingAuthority ?? '',
    issueDate: toDateInput(certification.issueDate),
    expirationDate: toDateInput(certification.expirationDate),
    pdfAssetId: certification.pdfAssetId ?? '',
    pdfOriginalName: certification.pdfAsset?.originalName ?? '',
    pdfSizeBytes: certification.pdfAsset?.sizeBytes ?? null,
  }
}

function fromImage(image: ProductImage, index: number): ImageDraft {
  return {
    clientId: image.id || `image-${index}`,
    assetId: image.assetId,
    role: image.role,
    altText: image.altText ?? '',
    originalName: image.asset.originalName,
    sizeBytes: image.asset.sizeBytes,
  }
}

function fromDocument(document: ProductDocument, index: number): DocumentDraft {
  return {
    clientId: document.id || `document-${index}`,
    assetId: document.assetId,
    kind: document.kind,
    title: document.title ?? '',
    originalName: document.asset.originalName,
    sizeBytes: document.asset.sizeBytes,
  }
}

function findCoverImage(images: ImageDraft[]): ImageDraft | undefined {
  return images.find((image) => image.role === 'COVER')
}

/** Position of a gallery image among gallery images, for display numbering. */
function galleryIndex(images: ImageDraft[], index: number): number {
  return images.slice(0, index).filter((image) => image.role === 'GALLERY').length
}

function fromDetail(detail: ProductDetail): ProductEditorForm {
  return {
    name: detail.name ?? '',
    sku: detail.sku ?? '',
    serialNumber: detail.serialNumber ?? '',
    categoryId: detail.categoryId ?? '',
    description: detail.description ?? '',
    productionDate: toDateInput(detail.productionDate),
    originCountry: detail.originCountry ?? '',
    materials: detail.materials
      .filter(isMaterial)
      .sort((left, right) => left.position - right.position)
      .map(fromMaterial),
    sustainability:
      detail.sustainability !== null && isSustainability(detail.sustainability)
        ? {
            carbonKgCo2e: detail.sustainability.carbonKgCo2e?.toString() ?? '',
            waterLitres: detail.sustainability.waterLitres?.toString() ?? '',
            recycledPercent: detail.sustainability.recycledPercent?.toString() ?? '',
            repairabilityScore: detail.sustainability.repairabilityScore?.toString() ?? '',
            recyclable: booleanInput(detail.sustainability.recyclable),
          }
        : null,
    certifications: detail.certifications.filter(isCertification).map(fromCertification),
    images: detail.images
      .filter(isProductImage)
      .sort((left, right) =>
        left.role === right.role ? left.position - right.position : left.role === 'COVER' ? -1 : 1,
      )
      .map(fromImage),
    documents: detail.documents
      .filter(isProductDocument)
      .sort((left, right) => left.position - right.position)
      .map(fromDocument),
  }
}

function toSavePayload(form: ProductEditorForm): SavePayload {
  // `position` is unique per role, so the cover is pinned to 0 and gallery images are
  // numbered in the order the editor holds them.
  let galleryPosition = 0
  const images = form.images.map((image) => {
    const position = image.role === 'COVER' ? 0 : galleryPosition
    if (image.role === 'GALLERY') {
      galleryPosition += 1
    }
    return {
      assetId: image.assetId,
      role: image.role,
      position,
      altText: nullableText(image.altText),
    }
  })

  return {
    name: nullableText(form.name),
    sku: nullableText(form.sku),
    serialNumber: nullableText(form.serialNumber),
    categoryId: nullableText(form.categoryId),
    description: nullableText(form.description),
    productionDate: nullableText(form.productionDate),
    originCountry: nullableText(form.originCountry.toUpperCase()),
    materials: form.materials.map((material, index) => ({
      name: material.name.trim(),
      percentage: Number(material.percentage),
      originCountry: nullableText(material.originCountry.toUpperCase()),
      recyclable: booleanValue(material.recyclable),
      position: index,
    })),
    sustainability:
      form.sustainability === null
        ? null
        : {
            carbonKgCo2e: nullableNumber(form.sustainability.carbonKgCo2e),
            waterLitres: nullableNumber(form.sustainability.waterLitres),
            recycledPercent: nullableNumber(form.sustainability.recycledPercent),
            repairabilityScore: nullableNumber(form.sustainability.repairabilityScore),
            recyclable: booleanValue(form.sustainability.recyclable),
          },
    certifications: form.certifications.map((certification) => ({
      name: nullableText(certification.name),
      issuingAuthority: nullableText(certification.issuingAuthority),
      issueDate: nullableText(certification.issueDate),
      expirationDate: nullableText(certification.expirationDate),
      pdfAssetId: nullableText(certification.pdfAssetId),
    })),
    images,
    documents: form.documents.map((document, index) => ({
      assetId: document.assetId,
      kind: document.kind,
      title: nullableText(document.title),
      position: index,
    })),
  }
}

function validateForm(form: ProductEditorForm): string | null {
  const countryFields = [
    ['origin country', form.originCountry],
    ...form.materials.map((material, index) => [
      `material ${index + 1} origin country`,
      material.originCountry,
    ]),
  ] as const
  for (const [label, value] of countryFields) {
    if (value.length > 0 && !/^[A-Z]{2}$/.test(value.toUpperCase())) {
      return `${label} must be a two-letter country code.`
    }
  }

  for (const [index, material] of form.materials.entries()) {
    if (material.name.trim().length === 0) {
      return `Material ${index + 1} needs a name.`
    }
    const percentage = Number(material.percentage)
    if (
      material.percentage.trim().length === 0 ||
      !Number.isFinite(percentage) ||
      percentage < 0 ||
      percentage > 100
    ) {
      return `Material ${index + 1} percentage must be between 0 and 100.`
    }
  }

  if (form.sustainability !== null) {
    const numericFields: Array<[string, string, number]> = [
      ['carbon footprint', form.sustainability.carbonKgCo2e, Number.POSITIVE_INFINITY],
      ['water usage', form.sustainability.waterLitres, Number.POSITIVE_INFINITY],
      ['recycled percentage', form.sustainability.recycledPercent, 100],
      ['repairability score', form.sustainability.repairabilityScore, 10],
    ]
    for (const [label, value, maximum] of numericFields) {
      if (value.trim().length === 0) {
        continue
      }
      const number = Number(value)
      if (!Number.isFinite(number) || number < 0 || number > maximum) {
        return `${label} must be a valid non-negative number${Number.isFinite(maximum) ? ` no greater than ${maximum}` : ''}.`
      }
    }
  }

  const coverCount = form.images.filter((image) => image.role === 'COVER').length
  if (coverCount > 1) {
    return 'Choose at most one cover image.'
  }
  const galleryCount = form.images.filter((image) => image.role === 'GALLERY').length
  if (galleryCount > MAX_GALLERY_IMAGES) {
    return `A product may have at most ${MAX_GALLERY_IMAGES} gallery images.`
  }

  return null
}

/**
 * Renders a private asset inline.
 *
 * The access token travels as an `Authorization` header, so an `<img src="/assets/...">`
 * cannot authenticate. The bytes are fetched through the normal authenticated request
 * and exposed as an object URL, which is revoked on unmount or when the asset changes.
 */
function AssetPreview({
  request,
  assetId,
  alt,
}: {
  request: AuthenticatedRequest
  assetId: string
  alt: string
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let created: string | null = null
    setObjectUrl(null)
    setFailed(false)

    void fetchAssetObjectUrl(request, assetId)
      .then((url) => {
        created = url
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        setObjectUrl(url)
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })

    return () => {
      cancelled = true
      if (created !== null) {
        URL.revokeObjectURL(created)
      }
    }
  }, [request, assetId])

  if (failed) {
    return (
      <div className="flex h-24 w-32 items-center justify-center rounded-box bg-base-200 text-xs text-base-content/60">
        Preview unavailable
      </div>
    )
  }

  if (objectUrl === null) {
    return (
      <div className="flex h-24 w-32 items-center justify-center rounded-box bg-base-200 text-xs text-base-content/60">
        Loading…
      </div>
    )
  }

  // Next disables its optimiser automatically for `blob:` sources, so the authenticated
  // object URL is rendered as-is without a loader request.
  return (
    <Image
      src={objectUrl}
      alt={alt}
      width={128}
      height={96}
      className="h-24 w-32 rounded-box object-cover"
    />
  )
}

export default function ProductEditorPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const productId = typeof params.id === 'string' ? params.id : ''
  const { request, status } = useAuth()
  const keyCounter = useRef(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState<ProductEditorForm>(EMPTY_FORM)
  const [draftRevision, setDraftRevision] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingCategories, setIsLoadingCategories] = useState(true)
  const [productError, setProductError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [tab, setTab] = useState<EditorTab>('general')
  const [savedPayloadKey, setSavedPayloadKey] = useState<string | null>(null)
  const [productStatus, setProductStatus] = useState<ProductStatus>('DRAFT')
  const [publication, setPublication] = useState<DraftPreviewPublication | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishNotice, setPublishNotice] = useState<string | null>(null)

  const coverImage = findCoverImage(form.images)

  /**
   * Dirty state is derived from the canonical save payload, not from object identity, so
   * re-creating the same form value never marks the draft dirty.
   */
  const currentPayloadKey = useMemo(() => JSON.stringify(toSavePayload(form)), [form])
  const isDirty = savedPayloadKey !== null && currentPayloadKey !== savedPayloadKey

  // Private draft assets are only fetched while the Preview tab is actually on screen.
  const previewImageAssetIds = useMemo(
    () => (tab === 'preview' ? form.images.map((image) => image.assetId) : []),
    [tab, form.images],
  )
  const previewImageSrcs = useAssetObjectUrls(request, previewImageAssetIds)

  const previewCategoryName = useMemo(
    () => categories.find((category) => category.id === form.categoryId)?.name ?? null,
    [categories, form.categoryId],
  )

  const previewModel = useMemo(
    () =>
      toDraftPresentationModel({
        form,
        categoryName: previewCategoryName,
        // The account exposes no company display name to the editor, so Preview is explicit
        // that this line is a placeholder rather than a real brand value.
        brandDisplayName: 'Your company name',
        status: productStatus,
        publication,
        imageSrcs: previewImageSrcs,
      }),
    [form, previewCategoryName, productStatus, publication, previewImageSrcs],
  )

  const nextClientId = useCallback((prefix: string): string => {
    keyCounter.current += 1
    return `${prefix}-${keyCounter.current}`
  }, [])

  const loadProduct = useCallback(
    async (replaceForm: boolean) => {
      setIsLoading(true)
      setProductError(null)
      try {
        const response = await request(`/products/${productId}`)
        const payload = await readApiResponse<unknown>(response)
        if (!isProductDetail(payload)) {
          throw new ProductApiError(502, 'The API returned invalid product data.')
        }
        setDraftRevision(payload.draftRevision)
        setProductStatus(payload.status)
        // The baseline always tracks the latest server state, so both a discarded refetch and
        // a "keep my changes" refetch leave the dirty calculation correct.
        setSavedPayloadKey(JSON.stringify(toSavePayload(fromDetail(payload))))
        if (replaceForm) {
          setForm(fromDetail(payload))
        }
      } catch (requestError: unknown) {
        setProductError(describeApiError(requestError, 'Unable to load this product.'))
        throw requestError
      } finally {
        setIsLoading(false)
      }
    },
    [productId, request],
  )

  useEffect(() => {
    if (status === 'signed-out') {
      router.replace('/login')
    }
  }, [router, status])

  useEffect(() => {
    if (status !== 'signed-in') {
      return
    }
    let active = true
    setIsLoadingCategories(true)
    void request('/categories')
      .then((response) => readApiResponse<unknown>(response))
      .then((payload) => {
        if (!Array.isArray(payload) || !payload.every(isCategory)) {
          throw new ProductApiError(502, 'The API returned invalid category data.')
        }
        if (active) {
          setCategories(payload)
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setProductError(describeApiError(requestError, 'Unable to load categories.'))
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingCategories(false)
        }
      })
    return () => {
      active = false
    }
  }, [request, status])

  useEffect(() => {
    if (status !== 'signed-in' || productId.length === 0) {
      return
    }
    void loadProduct(true).catch(() => undefined)
  }, [loadProduct, productId, status])

  function updateGeneral(
    field: keyof Pick<
      ProductEditorForm,
      | 'name'
      | 'sku'
      | 'serialNumber'
      | 'categoryId'
      | 'description'
      | 'productionDate'
      | 'originCountry'
    >,
    value: string,
  ) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function updateMaterial(index: number, patch: Partial<MaterialDraft>) {
    setForm((current) => ({
      ...current,
      materials: current.materials.map((material, materialIndex) =>
        materialIndex === index ? { ...material, ...patch } : material,
      ),
    }))
  }

  function removeMaterial(index: number) {
    setForm((current) => ({
      ...current,
      materials: current.materials.filter((_, materialIndex) => materialIndex !== index),
    }))
  }

  function moveMaterial(index: number, direction: -1 | 1) {
    setForm((current) => {
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= current.materials.length) {
        return current
      }
      const materials = [...current.materials]
      const currentMaterial = materials[index]
      const targetMaterial = materials[targetIndex]
      if (currentMaterial === undefined || targetMaterial === undefined) {
        return current
      }
      materials[index] = targetMaterial
      materials[targetIndex] = currentMaterial
      return { ...current, materials }
    })
  }

  function updateSustainability(patch: Partial<SustainabilityDraft>) {
    setForm((current) =>
      current.sustainability === null
        ? current
        : { ...current, sustainability: { ...current.sustainability, ...patch } },
    )
  }

  function updateCertification(index: number, patch: Partial<CertificationDraft>) {
    setForm((current) => ({
      ...current,
      certifications: current.certifications.map((certification, certificationIndex) =>
        certificationIndex === index ? { ...certification, ...patch } : certification,
      ),
    }))
  }

  function removeCertification(index: number) {
    setForm((current) => ({
      ...current,
      certifications: current.certifications.filter(
        (_, certificationIndex) => certificationIndex !== index,
      ),
    }))
  }

  /**
   * The single upload path.
   *
   * The file picker and drag-and-drop both call this, so there is exactly one
   * implementation of "upload then hold the returned asset id in editor state".
   * A failed upload reports the API's message and leaves the form untouched.
   */
  async function handleUpload(file: File): Promise<AssetUploadResponse | null> {
    setIsUploading(true)
    setUploadError(null)
    try {
      return await uploadAsset(request, file)
    } catch (uploadFailure: unknown) {
      setUploadError(describeApiError(uploadFailure, 'That file could not be uploaded.'))
      return null
    } finally {
      setIsUploading(false)
    }
  }

  async function addImage(file: File, role: ImageRole) {
    const asset = await handleUpload(file)
    if (asset === null) {
      return
    }
    setForm((current) => ({
      ...current,
      images: [
        // Uploading a cover replaces the existing one, since a product may have
        // exactly one and the API rejects a second.
        ...(role === 'COVER'
          ? current.images.filter((image) => image.role !== 'COVER')
          : current.images),
        {
          clientId: nextClientId('image'),
          assetId: asset.id,
          role,
          altText: '',
          originalName: asset.originalName,
          sizeBytes: asset.sizeBytes,
        },
      ],
    }))
  }

  function updateImage(index: number, patch: Partial<ImageDraft>) {
    setForm((current) => ({
      ...current,
      images: current.images.map((image, imageIndex) =>
        imageIndex === index ? { ...image, ...patch } : image,
      ),
    }))
  }

  function removeImage(index: number) {
    setForm((current) => ({
      ...current,
      images: current.images.filter((_, imageIndex) => imageIndex !== index),
    }))
  }

  /**
   * Reorders an image within its own role.
   *
   * Positions are recomputed from array order at save time, so swapping with the
   * next image of the same role is enough. A cover never swaps, because there is only
   * ever one.
   */
  function moveImage(index: number, direction: -1 | 1) {
    setForm((current) => {
      const image = current.images[index]
      if (image === undefined) {
        return current
      }

      let neighbour = index + direction
      while (
        neighbour >= 0 &&
        neighbour < current.images.length &&
        current.images[neighbour]?.role !== image.role
      ) {
        neighbour += direction
      }

      const target = current.images[neighbour]
      if (target === undefined || target.role !== image.role) {
        return current
      }

      const images = [...current.images]
      images[index] = target
      images[neighbour] = image
      return { ...current, images }
    })
  }

  async function addDocument(file: File, kind: DocumentKind) {
    const asset = await handleUpload(file)
    if (asset === null) {
      return
    }
    setForm((current) => ({
      ...current,
      documents: [
        ...current.documents,
        {
          clientId: nextClientId('document'),
          assetId: asset.id,
          kind,
          title: '',
          originalName: asset.originalName,
          sizeBytes: asset.sizeBytes,
        },
      ],
    }))
  }

  function updateDocument(index: number, patch: Partial<DocumentDraft>) {
    setForm((current) => ({
      ...current,
      documents: current.documents.map((document, documentIndex) =>
        documentIndex === index ? { ...document, ...patch } : document,
      ),
    }))
  }

  function removeDocument(index: number) {
    setForm((current) => ({
      ...current,
      documents: current.documents.filter((_, documentIndex) => documentIndex !== index),
    }))
  }

  function moveDocument(index: number, direction: -1 | 1) {
    setForm((current) => {
      const target = index + direction
      const document = current.documents[index]
      const neighbour = current.documents[target]
      if (document === undefined || neighbour === undefined) {
        return current
      }

      const documents = [...current.documents]
      documents[index] = neighbour
      documents[target] = document
      return { ...current, documents }
    })
  }

  async function attachCertificationPdf(index: number, file: File) {
    const asset = await handleUpload(file)
    if (asset === null) {
      return
    }
    updateCertification(index, {
      pdfAssetId: asset.id,
      pdfOriginalName: asset.originalName,
      pdfSizeBytes: asset.sizeBytes,
    })
  }

  function removeCertificationPdf(index: number) {
    updateCertification(index, { pdfAssetId: '', pdfOriginalName: '', pdfSizeBytes: null })
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaveError(null)
    if (conflict !== null) {
      setSaveError('Choose how to resolve the stale draft before saving again.')
      return
    }
    if (draftRevision === null) {
      setSaveError('The current draft revision is unavailable. Refetch the product and try again.')
      return
    }
    const validationError = validateForm(form)
    if (validationError !== null) {
      setSaveError(validationError)
      return
    }

    setIsSaving(true)
    try {
      const response = await request(`/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...toSavePayload(form), expectedDraftRevision: draftRevision }),
      })
      const payload = await readApiResponse<unknown>(response)
      if (!isProductDetail(payload)) {
        throw new ProductApiError(502, 'The API returned invalid product data.')
      }
      const savedForm = fromDetail(payload)
      setDraftRevision(payload.draftRevision)
      setProductStatus(payload.status)
      setForm(savedForm)
      setSavedPayloadKey(JSON.stringify(toSavePayload(savedForm)))
      setSaveError(null)
    } catch (requestError: unknown) {
      if (requestError instanceof ProductApiError && requestError.status === 409) {
        setConflict({
          message:
            'This draft changed elsewhere. Your entered data is still here. Choose whether to use your changes on the latest revision or discard them.',
        })
        setSaveError(null)
      } else {
        setSaveError(
          describeApiError(requestError, 'Unable to save this draft. Your changes are still here.'),
        )
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function handlePublish() {
    setPublishError(null)
    setPublishNotice(null)

    if (conflict !== null) {
      setPublishError('Choose how to resolve the stale draft before publishing.')
      return
    }
    if (draftRevision === null) {
      setPublishError(
        'The current draft revision is unavailable. Refetch the product and try again.',
      )
      return
    }
    // Publishing is never combined with saving: the revision the operator reviewed must be
    // the revision that gets published.
    if (isDirty) {
      setPublishError(
        'Save the draft before publishing, so the published revision is the one you reviewed.',
      )
      return
    }

    setIsPublishing(true)
    try {
      const response = await request(`/products/${productId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedDraftRevision: draftRevision }),
      })
      const payload = await readApiResponse<unknown>(response)
      if (!isPublishResult(payload)) {
        throw new ProductApiError(502, 'The API returned invalid publication data.')
      }
      setProductStatus('PUBLISHED')
      setPublication({
        publicUuid: payload.publicUuid,
        version: payload.versionNumber,
        publicUrl: payload.publicUrl,
        publishedAt: payload.publishedAt,
        creationDate: payload.firstPublishedAt,
      })
      setPublishNotice(
        payload.replayed
          ? `This revision is already published as v${payload.versionNumber}; the public passport is unchanged.`
          : `Published as v${payload.versionNumber}. The public passport now shows this revision.`,
      )
    } catch (requestError: unknown) {
      if (
        requestError instanceof ProductApiError &&
        requestError.code === 'PRODUCT_REVISION_CONFLICT'
      ) {
        // Same contract as a stale save: never publish a revision the operator did not review.
        setConflict({
          message:
            'This draft changed elsewhere. Your entered data is still here. Choose whether to use your changes on the latest revision or discard them.',
        })
      } else if (
        requestError instanceof ProductApiError &&
        (requestError.code === 'PUBLICATION_INCOMPLETE' ||
          requestError.code === 'PUBLICATION_ASSET_UNAVAILABLE' ||
          requestError.code === 'PUBLICATION_ASSET_TYPE_INVALID')
      ) {
        setPublishError(requestError.message)
        const owningTab = firstTabForPublicationGaps(requestError.message)
        if (owningTab !== null) {
          setTab(owningTab)
        }
      } else {
        setPublishError(
          describeApiError(
            requestError,
            'Unable to publish this product. Your draft is unchanged.',
          ),
        )
      }
    } finally {
      setIsPublishing(false)
    }
  }

  async function keepChangesOnLatestRevision() {
    setSaveError(null)
    try {
      await loadProduct(false)
      setConflict(null)
    } catch {
      setSaveError('We could not refetch the latest revision. Your entered data is still here.')
    }
  }

  async function discardChangesAndRefetch() {
    if (
      !window.confirm('Discard your entered changes and replace them with the latest server draft?')
    ) {
      return
    }
    setSaveError(null)
    try {
      await loadProduct(true)
      setConflict(null)
    } catch {
      setSaveError('We could not refetch the latest revision. Your entered data is still here.')
    }
  }

  if (status === 'loading' || isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base-200 p-6">
        <span
          className="loading loading-spinner loading-md text-primary"
          role="status"
          aria-label="Loading"
        />
      </main>
    )
  }

  if (status === 'signed-out') {
    return null
  }

  if (productError !== null && draftRevision === null) {
    return (
      <main className="min-h-screen bg-base-200 p-4 sm:p-8">
        <div className="mx-auto max-w-3xl">
          <header className="flex items-center justify-between border-b border-base-300 pb-5">
            <Link
              href="/products"
              className="text-sm font-semibold uppercase tracking-[0.18em] text-primary"
            >
              Products
            </Link>
            <LogoutButton />
          </header>
          <p className="alert alert-error mt-8" role="alert">
            {productError}
          </p>
          <Link
            href="/products"
            className="btn btn-ghost mt-4 focus:outline-2 focus:outline-offset-2 focus:outline-primary"
          >
            Back to products
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-base-200 p-4 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-base-300 pb-5">
          <div>
            <Link
              href="/products"
              className="text-sm font-semibold uppercase tracking-[0.18em] text-primary"
            >
              Products
            </Link>
            <h1 className="mt-2 text-3xl font-semibold text-base-content">Edit product draft</h1>
            <p className="mt-1 text-sm text-base-content/70">
              Draft revision {draftRevision ?? '—'} · changes are saved explicitly
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/products"
              className="btn btn-ghost btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
            >
              Back to products
            </Link>
            <LogoutButton />
          </div>
        </header>

        {productError !== null ? (
          <p className="alert alert-warning mt-6" role="alert">
            {productError}
          </p>
        ) : null}

        {conflict !== null ? (
          <section
            className="alert alert-warning mt-6 items-start"
            role="alert"
            aria-labelledby="conflict-heading"
          >
            <div>
              <h2 id="conflict-heading" className="font-semibold">
                Stale draft revision
              </h2>
              <p className="mt-1 text-sm">{conflict.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-warning focus:outline-2 focus:outline-offset-2 focus:outline-warning"
                  onClick={() => void keepChangesOnLatestRevision()}
                  disabled={isLoading}
                >
                  Use my changes on latest revision
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  onClick={() => void discardChangesAndRefetch()}
                  disabled={isLoading}
                >
                  Discard changes and refetch
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {saveError !== null ? (
          <p className="alert alert-error mt-6" role="alert">
            {saveError}
          </p>
        ) : null}

        <EditorTabList tab={tab} onSelect={setTab} />

        {publishError !== null ? (
          <p className="alert alert-error mt-4" role="alert" data-testid="publish-error">
            {publishError}
          </p>
        ) : null}

        {publishNotice !== null ? (
          <div
            className="alert alert-success mt-4 items-start"
            role="status"
            data-testid="publish-notice"
          >
            <div className="min-w-0">
              <p className="font-semibold">{publishNotice}</p>
              {publication !== null ? (
                <p className="mt-2 text-sm">
                  <a
                    className="link"
                    href={publication.publicUrl}
                    data-testid="publish-public-link"
                  >
                    Open the public passport
                  </a>{' '}
                  <span className="break-all font-mono text-xs">{publication.publicUrl}</span>
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <form className="mt-6 space-y-6" onSubmit={handleSave}>
          <section
            role="tabpanel"
            id="panel-general"
            aria-labelledby="tab-general"
            data-tab-panel="general"
            hidden={tab !== 'general'}
            className={`card border border-base-300 bg-base-100 shadow-sm ${
              tab === 'general' ? '' : 'hidden'
            }`}
          >
            <div className="card-body gap-5">
              <div>
                <h2 id="general-heading" className="card-title text-xl">
                  General Information
                </h2>
                <p className="mt-1 text-sm text-base-content/70">
                  Add the product identity and origin details.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="form-control">
                  <label className="label" htmlFor="product-name">
                    <span className="label-text font-medium">Name</span>
                  </label>
                  <input
                    id="product-name"
                    type="text"
                    value={form.name}
                    onChange={(event) => updateGeneral('name', event.target.value)}
                    maxLength={240}
                    className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  />
                </div>
                <div className="form-control">
                  <label className="label" htmlFor="product-sku">
                    <span className="label-text font-medium">SKU</span>
                  </label>
                  <input
                    id="product-sku"
                    type="text"
                    value={form.sku}
                    onChange={(event) => updateGeneral('sku', event.target.value)}
                    maxLength={128}
                    className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  />
                </div>
                <div className="form-control">
                  <label className="label" htmlFor="product-serial">
                    <span className="label-text font-medium">Serial number</span>
                  </label>
                  <input
                    id="product-serial"
                    type="text"
                    value={form.serialNumber}
                    onChange={(event) => updateGeneral('serialNumber', event.target.value)}
                    maxLength={160}
                    className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  />
                </div>
                <div className="form-control">
                  <label className="label" htmlFor="product-category-select">
                    <span className="label-text font-medium">Category</span>
                  </label>
                  <select
                    id="product-category-select"
                    value={form.categoryId}
                    onChange={(event) => updateGeneral('categoryId', event.target.value)}
                    disabled={isLoadingCategories}
                    className="select select-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  >
                    <option value="">No category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-control">
                  <label className="label" htmlFor="production-date">
                    <span className="label-text font-medium">Production date</span>
                  </label>
                  <input
                    id="production-date"
                    type="date"
                    value={form.productionDate}
                    onChange={(event) => updateGeneral('productionDate', event.target.value)}
                    className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  />
                </div>
                <div className="form-control">
                  <label className="label" htmlFor="origin-country">
                    <span className="label-text font-medium">Origin country</span>
                  </label>
                  <input
                    id="origin-country"
                    type="text"
                    value={form.originCountry}
                    onChange={(event) =>
                      updateGeneral('originCountry', event.target.value.toUpperCase())
                    }
                    maxLength={2}
                    pattern="[A-Z]{2}"
                    placeholder="US"
                    className="input input-bordered w-full uppercase focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  />
                </div>
                <div className="form-control md:col-span-2">
                  <label className="label" htmlFor="product-description">
                    <span className="label-text font-medium">Description</span>
                  </label>
                  <textarea
                    id="product-description"
                    value={form.description}
                    onChange={(event) => updateGeneral('description', event.target.value)}
                    rows={4}
                    className="textarea textarea-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  />
                </div>
              </div>
            </div>
          </section>

          <section
            role="tabpanel"
            id="panel-images"
            aria-labelledby="tab-images"
            data-tab-panel="images"
            hidden={tab !== 'images'}
            className={`card border border-base-300 bg-base-100 shadow-sm ${
              tab === 'images' ? '' : 'hidden'
            }`}
          >
            <div className="card-body gap-5">
              <div>
                <h2 id="images-heading" className="card-title text-xl">
                  Images
                </h2>
                <p className="mt-1 text-sm text-base-content/70">
                  One cover image and up to {MAX_GALLERY_IMAGES} gallery images. JPEG, PNG or WebP,
                  up to 5 MiB each. The API re-encodes every upload and strips metadata.
                </p>
              </div>

              {uploadError !== null ? (
                <p role="alert" className="text-sm text-error">
                  {uploadError}
                </p>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="form-control">
                  <label className="label" htmlFor="cover-image">
                    <span className="label-text font-medium">
                      {coverImage === undefined ? 'Cover image' : 'Replace cover image'}
                    </span>
                  </label>
                  <input
                    id="cover-image"
                    type="file"
                    accept={IMAGE_ACCEPT}
                    disabled={isUploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file !== undefined) {
                        void addImage(file, 'COVER')
                      }
                    }}
                    className="file-input file-input-bordered w-full"
                  />
                </div>
                <div className="form-control">
                  <label className="label" htmlFor="gallery-image">
                    <span className="label-text font-medium">Add gallery image</span>
                  </label>
                  <input
                    id="gallery-image"
                    type="file"
                    accept={IMAGE_ACCEPT}
                    disabled={isUploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file !== undefined) {
                        void addImage(file, 'GALLERY')
                      }
                    }}
                    className="file-input file-input-bordered w-full"
                  />
                </div>
              </div>

              <label
                htmlFor="gallery-image"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const file = event.dataTransfer.files?.[0]
                  if (file !== undefined) {
                    void addImage(file, 'GALLERY')
                  }
                }}
                className="cursor-pointer rounded-box border border-dashed border-base-300 p-4 text-center text-sm text-base-content/70"
              >
                Or drop an image here to add it to the gallery.
              </label>

              {form.images.length === 0 ? (
                <p className="text-sm text-base-content/70">No images attached yet.</p>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {form.images.map((image, index) => (
                    <li
                      key={image.clientId}
                      className="flex flex-col gap-3 rounded-box border border-base-300 p-4"
                    >
                      <AssetPreview
                        request={request}
                        assetId={image.assetId}
                        alt={image.altText.length > 0 ? image.altText : image.originalName}
                      />
                      <p className="text-sm font-semibold">
                        {image.role === 'COVER'
                          ? 'Cover'
                          : `Gallery ${galleryIndex(form.images, index) + 1}`}
                      </p>
                      <p
                        className="truncate text-xs text-base-content/70"
                        title={image.originalName}
                      >
                        {image.originalName}
                      </p>
                      <div className="form-control">
                        <label className="label" htmlFor={`image-alt-${index}`}>
                          <span className="label-text text-xs">Alt text</span>
                        </label>
                        <input
                          id={`image-alt-${index}`}
                          type="text"
                          value={image.altText}
                          maxLength={240}
                          onChange={(event) => updateImage(index, { altText: event.target.value })}
                          className="input input-bordered input-sm w-full"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-outline btn-xs"
                          disabled={image.role === 'COVER'}
                          onClick={() => moveImage(index, -1)}
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-xs"
                          disabled={image.role === 'COVER'}
                          onClick={() => moveImage(index, 1)}
                        >
                          Move down
                        </button>
                        <button
                          type="button"
                          className="btn btn-error btn-outline btn-xs"
                          onClick={() => removeImage(index)}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section
            role="tabpanel"
            id="panel-documents"
            aria-labelledby="tab-documents"
            data-tab-panel="documents"
            hidden={tab !== 'documents'}
            className={`card border border-base-300 bg-base-100 shadow-sm ${
              tab === 'documents' ? '' : 'hidden'
            }`}
          >
            <div className="card-body gap-5">
              <div>
                <h2 id="documents-heading" className="card-title text-xl">
                  Documents
                </h2>
                <p className="mt-1 text-sm text-base-content/70">
                  Manuals, warranties and technical datasheets as PDF, up to 10 MiB each.
                </p>
              </div>

              <label
                htmlFor="document-upload-MANUAL"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const file = event.dataTransfer.files?.[0]
                  if (file !== undefined) {
                    void addDocument(file, 'MANUAL')
                  }
                }}
                className="cursor-pointer rounded-box border border-dashed border-base-300 p-4 text-center text-sm text-base-content/70"
              >
                Drop a PDF here to attach it as a manual.
              </label>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {DOCUMENT_KINDS.map((kind) => (
                  <div className="form-control" key={kind}>
                    <label className="label" htmlFor={`document-upload-${kind}`}>
                      <span className="label-text font-medium">
                        Add {DOCUMENT_KIND_LABELS[kind].toLowerCase()}
                      </span>
                    </label>
                    <input
                      id={`document-upload-${kind}`}
                      type="file"
                      accept={PDF_ACCEPT}
                      disabled={isUploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (file !== undefined) {
                          void addDocument(file, kind)
                        }
                      }}
                      className="file-input file-input-bordered w-full"
                    />
                  </div>
                ))}
              </div>

              {form.documents.length === 0 ? (
                <p className="text-sm text-base-content/70">No documents attached yet.</p>
              ) : (
                <ul className="grid gap-4 md:grid-cols-2">
                  {form.documents.map((document, index) => (
                    <li
                      key={document.clientId}
                      className="flex flex-col gap-3 rounded-box border border-base-300 p-4"
                    >
                      <p className="truncate text-sm font-semibold" title={document.originalName}>
                        {document.originalName}
                      </p>
                      <div className="form-control">
                        <label className="label" htmlFor={`document-kind-${index}`}>
                          <span className="label-text text-xs">Type</span>
                        </label>
                        <select
                          id={`document-kind-${index}`}
                          value={document.kind}
                          onChange={(event) =>
                            updateDocument(index, { kind: event.target.value as DocumentKind })
                          }
                          className="select select-bordered select-sm w-full"
                        >
                          {DOCUMENT_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {DOCUMENT_KIND_LABELS[kind]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-control">
                        <label className="label" htmlFor={`document-title-${index}`}>
                          <span className="label-text text-xs">Title</span>
                        </label>
                        <input
                          id={`document-title-${index}`}
                          type="text"
                          value={document.title}
                          maxLength={240}
                          onChange={(event) => updateDocument(index, { title: event.target.value })}
                          className="input input-bordered input-sm w-full"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-outline btn-xs"
                          onClick={() => moveDocument(index, -1)}
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-xs"
                          onClick={() => moveDocument(index, 1)}
                        >
                          Move down
                        </button>
                        <button
                          type="button"
                          className="btn btn-error btn-outline btn-xs"
                          onClick={() => removeDocument(index)}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section
            role="tabpanel"
            id="panel-materials"
            aria-labelledby="tab-materials"
            data-tab-panel="materials"
            hidden={tab !== 'materials'}
            className={`card border border-base-300 bg-base-100 shadow-sm ${
              tab === 'materials' ? '' : 'hidden'
            }`}
          >
            <div className="card-body gap-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="materials-heading" className="card-title text-xl">
                    Materials
                  </h2>
                  <p className="mt-1 text-sm text-base-content/70">
                    Reorder materials with the arrow controls.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      materials: [
                        ...current.materials,
                        {
                          clientId: nextClientId('material'),
                          name: '',
                          percentage: '',
                          originCountry: '',
                          recyclable: '',
                        },
                      ],
                    }))
                  }
                >
                  Add material
                </button>
              </div>
              {form.materials.length === 0 ? (
                <p className="rounded-box bg-base-200 p-4 text-sm text-base-content/70">
                  No materials added yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {form.materials.map((material, index) => (
                    <fieldset
                      key={material.clientId}
                      className="rounded-box border border-base-300 p-4"
                    >
                      <legend className="px-2 text-sm font-semibold">Material {index + 1}</legend>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="form-control lg:col-span-2">
                          <label className="label" htmlFor={`material-name-${index}`}>
                            <span className="label-text font-medium">Name</span>
                          </label>
                          <input
                            id={`material-name-${index}`}
                            type="text"
                            value={material.name}
                            onChange={(event) =>
                              updateMaterial(index, { name: event.target.value })
                            }
                            maxLength={160}
                            className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                          />
                        </div>
                        <div className="form-control">
                          <label className="label" htmlFor={`material-percentage-${index}`}>
                            <span className="label-text font-medium">Percentage</span>
                          </label>
                          <input
                            id={`material-percentage-${index}`}
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={material.percentage}
                            onChange={(event) =>
                              updateMaterial(index, { percentage: event.target.value })
                            }
                            className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                          />
                        </div>
                        <div className="form-control">
                          <label className="label" htmlFor={`material-country-${index}`}>
                            <span className="label-text font-medium">Origin country</span>
                          </label>
                          <input
                            id={`material-country-${index}`}
                            type="text"
                            maxLength={2}
                            pattern="[A-Z]{2}"
                            value={material.originCountry}
                            onChange={(event) =>
                              updateMaterial(index, {
                                originCountry: event.target.value.toUpperCase(),
                              })
                            }
                            placeholder="US"
                            className="input input-bordered w-full uppercase focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                          />
                        </div>
                        <div className="form-control">
                          <label className="label" htmlFor={`material-recyclable-${index}`}>
                            <span className="label-text font-medium">Recyclable</span>
                          </label>
                          <select
                            id={`material-recyclable-${index}`}
                            value={material.recyclable}
                            onChange={(event) =>
                              updateMaterial(index, {
                                recyclable: event.target.value as MaterialDraft['recyclable'],
                              })
                            }
                            className="select select-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                          >
                            <option value="">Not specified</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                          onClick={() => moveMaterial(index, -1)}
                          disabled={index === 0}
                          aria-label={`Move material ${index + 1} up`}
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                          onClick={() => moveMaterial(index, 1)}
                          disabled={index === form.materials.length - 1}
                          aria-label={`Move material ${index + 1} down`}
                        >
                          Move down
                        </button>
                        <button
                          type="button"
                          className="btn btn-error btn-outline btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-error"
                          onClick={() => removeMaterial(index)}
                        >
                          Remove
                        </button>
                      </div>
                    </fieldset>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section
            role="tabpanel"
            id="panel-sustainability"
            aria-labelledby="tab-sustainability"
            data-tab-panel="sustainability"
            hidden={tab !== 'sustainability'}
            className={`card border border-base-300 bg-base-100 shadow-sm ${
              tab === 'sustainability' ? '' : 'hidden'
            }`}
          >
            <div className="card-body gap-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="sustainability-heading" className="card-title text-xl">
                    Sustainability
                  </h2>
                  <p className="mt-1 text-sm text-base-content/70">
                    Track optional environmental metrics.
                  </p>
                </div>
                {form.sustainability === null ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        sustainability: {
                          carbonKgCo2e: '',
                          waterLitres: '',
                          recycledPercent: '',
                          repairabilityScore: '',
                          recyclable: '',
                        },
                      }))
                    }
                  >
                    Add sustainability details
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-error btn-outline btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-error"
                    onClick={() => setForm((current) => ({ ...current, sustainability: null }))}
                  >
                    Remove sustainability
                  </button>
                )}
              </div>
              {form.sustainability === null ? (
                <p className="rounded-box bg-base-200 p-4 text-sm text-base-content/70">
                  No sustainability details added.
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div className="form-control">
                    <label className="label" htmlFor="carbon-kg">
                      <span className="label-text font-medium">Carbon (kg CO₂e)</span>
                    </label>
                    <input
                      id="carbon-kg"
                      type="number"
                      min="0"
                      step="0.001"
                      value={form.sustainability.carbonKgCo2e}
                      onChange={(event) =>
                        updateSustainability({ carbonKgCo2e: event.target.value })
                      }
                      className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                    />
                  </div>
                  <div className="form-control">
                    <label className="label" htmlFor="water-litres">
                      <span className="label-text font-medium">Water (litres)</span>
                    </label>
                    <input
                      id="water-litres"
                      type="number"
                      min="0"
                      step="0.001"
                      value={form.sustainability.waterLitres}
                      onChange={(event) =>
                        updateSustainability({ waterLitres: event.target.value })
                      }
                      className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                    />
                  </div>
                  <div className="form-control">
                    <label className="label" htmlFor="recycled-percent">
                      <span className="label-text font-medium">Recycled percentage</span>
                    </label>
                    <input
                      id="recycled-percent"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={form.sustainability.recycledPercent}
                      onChange={(event) =>
                        updateSustainability({ recycledPercent: event.target.value })
                      }
                      className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                    />
                  </div>
                  <div className="form-control">
                    <label className="label" htmlFor="repairability-score">
                      <span className="label-text font-medium">Repairability score</span>
                    </label>
                    <input
                      id="repairability-score"
                      type="number"
                      min="0"
                      max="10"
                      step="0.01"
                      value={form.sustainability.repairabilityScore}
                      onChange={(event) =>
                        updateSustainability({ repairabilityScore: event.target.value })
                      }
                      className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                    />
                  </div>
                  <div className="form-control">
                    <label className="label" htmlFor="sustainability-recyclable">
                      <span className="label-text font-medium">Product recyclable</span>
                    </label>
                    <select
                      id="sustainability-recyclable"
                      value={form.sustainability.recyclable}
                      onChange={(event) =>
                        updateSustainability({
                          recyclable: event.target.value as SustainabilityDraft['recyclable'],
                        })
                      }
                      className="select select-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                    >
                      <option value="">Not specified</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section
            role="tabpanel"
            id="panel-certifications"
            aria-labelledby="tab-certifications"
            data-tab-panel="certifications"
            hidden={tab !== 'certifications'}
            className={`card border border-base-300 bg-base-100 shadow-sm ${
              tab === 'certifications' ? '' : 'hidden'
            }`}
          >
            <div className="card-body gap-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="certifications-heading" className="card-title text-xl">
                    Certifications
                  </h2>
                  <p className="mt-1 text-sm text-base-content/70">
                    Attach an optional PDF to each certification. Metadata alone is enough to save a
                    draft.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      certifications: [
                        ...current.certifications,
                        {
                          clientId: nextClientId('certification'),
                          name: '',
                          issuingAuthority: '',
                          issueDate: '',
                          expirationDate: '',
                          pdfAssetId: '',
                          pdfOriginalName: '',
                          pdfSizeBytes: null,
                        },
                      ],
                    }))
                  }
                >
                  Add certification
                </button>
              </div>
              {form.certifications.length === 0 ? (
                <p className="rounded-box bg-base-200 p-4 text-sm text-base-content/70">
                  No certification metadata added yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {form.certifications.map((certification, index) => (
                    <fieldset
                      key={certification.clientId}
                      className="rounded-box border border-base-300 p-4"
                    >
                      <legend className="px-2 text-sm font-semibold">
                        Certification {index + 1}
                      </legend>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="form-control">
                          <label className="label" htmlFor={`certification-name-${index}`}>
                            <span className="label-text font-medium">Name</span>
                          </label>
                          <input
                            id={`certification-name-${index}`}
                            type="text"
                            value={certification.name}
                            onChange={(event) =>
                              updateCertification(index, { name: event.target.value })
                            }
                            maxLength={240}
                            className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                          />
                        </div>
                        <div className="form-control">
                          <label className="label" htmlFor={`certification-authority-${index}`}>
                            <span className="label-text font-medium">Issuing authority</span>
                          </label>
                          <input
                            id={`certification-authority-${index}`}
                            type="text"
                            value={certification.issuingAuthority}
                            onChange={(event) =>
                              updateCertification(index, { issuingAuthority: event.target.value })
                            }
                            maxLength={240}
                            className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                          />
                        </div>
                        <div className="form-control">
                          <label className="label" htmlFor={`certification-issue-date-${index}`}>
                            <span className="label-text font-medium">Issue date</span>
                          </label>
                          <input
                            id={`certification-issue-date-${index}`}
                            type="date"
                            value={certification.issueDate}
                            onChange={(event) =>
                              updateCertification(index, { issueDate: event.target.value })
                            }
                            className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                          />
                        </div>
                        <div className="form-control">
                          <label
                            className="label"
                            htmlFor={`certification-expiration-date-${index}`}
                          >
                            <span className="label-text font-medium">Expiration date</span>
                          </label>
                          <input
                            id={`certification-expiration-date-${index}`}
                            type="date"
                            value={certification.expirationDate}
                            onChange={(event) =>
                              updateCertification(index, { expirationDate: event.target.value })
                            }
                            className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                          />
                        </div>
                      </div>

                      <div className="mt-4 rounded-box border border-base-300 p-4">
                        <p className="text-sm font-semibold">Certification PDF</p>
                        {certification.pdfAssetId.length > 0 ? (
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                            <span
                              className="truncate text-sm text-base-content/80"
                              title={certification.pdfOriginalName}
                            >
                              {certification.pdfOriginalName.length > 0
                                ? certification.pdfOriginalName
                                : 'PDF attached'}
                            </span>
                            <div className="flex flex-wrap gap-2">
                              <label
                                className="btn btn-outline btn-xs"
                                htmlFor={`certification-pdf-${index}`}
                              >
                                Replace
                              </label>
                              <button
                                type="button"
                                className="btn btn-error btn-outline btn-xs"
                                onClick={() => removeCertificationPdf(index)}
                              >
                                Remove PDF
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-base-content/70">
                            No PDF attached to this certification.
                          </p>
                        )}
                        <input
                          id={`certification-pdf-${index}`}
                          type="file"
                          accept={PDF_ACCEPT}
                          disabled={isUploading}
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            event.target.value = ''
                            if (file !== undefined) {
                              void attachCertificationPdf(index, file)
                            }
                          }}
                          className="file-input file-input-bordered file-input-sm mt-3 w-full"
                        />
                      </div>

                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          className="btn btn-error btn-outline btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-error"
                          onClick={() => removeCertification(index)}
                        >
                          Remove certification
                        </button>
                      </div>
                    </fieldset>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section
            role="tabpanel"
            id="panel-preview"
            aria-labelledby="tab-preview"
            data-tab-panel="preview"
            hidden={tab !== 'preview'}
            className={`card border border-base-300 bg-base-100 shadow-sm ${
              tab === 'preview' ? '' : 'hidden'
            }`}
          >
            <div className="card-body gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="preview-heading" className="card-title">
                  Preview
                </h2>
                <span className="badge badge-warning badge-sm" data-testid="preview-banner">
                  Draft preview — unpublished editor state
                </span>
              </div>
              <p className="text-sm text-base-content/70">
                This renders the current editor contents through the same presentation component the
                public passport page uses. It includes changes you have not saved yet, and it is not
                the published passport.
              </p>
              <div
                className="rounded-box border border-base-300 bg-base-200 p-4"
                data-testid="preview-panel"
              >
                <PassportPresentation model={previewModel} />
              </div>
            </div>
          </section>

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-box border border-base-300 bg-base-100/95 p-4 shadow-lg backdrop-blur">
            <div className="text-sm text-base-content/70">
              <p>Save sends revision {draftRevision ?? '—'}.</p>
              <p className="mt-1 text-xs" data-testid="dirty-state">
                {isDirty ? 'Unsaved changes — save before publishing.' : 'No unsaved changes.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className="btn btn-primary min-w-36 focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                disabled={isSaving || isLoading || conflict !== null}
              >
                {isSaving ? (
                  <span className="loading loading-spinner loading-sm" aria-hidden="true" />
                ) : null}
                {isSaving ? 'Saving...' : 'Save draft'}
              </button>
              <button
                type="button"
                className="btn btn-secondary min-w-36 focus:outline-2 focus:outline-offset-2 focus:outline-secondary"
                data-testid="publish-button"
                onClick={() => void handlePublish()}
                disabled={
                  isPublishing ||
                  isSaving ||
                  isLoading ||
                  isDirty ||
                  conflict !== null ||
                  draftRevision === null
                }
              >
                {isPublishing ? (
                  <span className="loading loading-spinner loading-sm" aria-hidden="true" />
                ) : null}
                {isPublishing
                  ? 'Publishing...'
                  : productStatus === 'PUBLISHED'
                    ? 'Republish'
                    : 'Publish'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  )
}
