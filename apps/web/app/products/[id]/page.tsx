'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth-context'
import { LogoutButton } from '../../logout-button'
import { describeApiError, ProductApiError, readApiResponse } from '../api'
import type {
  Category,
  Certification,
  CertificationDraft,
  Material,
  MaterialDraft,
  ProductDetail,
  ProductEditorForm,
  Sustainability,
  SustainabilityDraft,
} from '../types'

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
    (candidate.sustainability === null || typeof candidate.sustainability === 'object')
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
    (candidate.expirationDate === null || typeof candidate.expirationDate === 'string')
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
  }
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
  }
}

function toSavePayload(form: ProductEditorForm): SavePayload {
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
  return null
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
      setDraftRevision(payload.draftRevision)
      setForm(fromDetail(payload))
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

        <form className="mt-6 space-y-6" onSubmit={handleSave}>
          <section
            className="card border border-base-300 bg-base-100 shadow-sm"
            aria-labelledby="general-heading"
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
            className="card border border-base-300 bg-base-100 shadow-sm"
            aria-labelledby="materials-heading"
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
            className="card border border-base-300 bg-base-100 shadow-sm"
            aria-labelledby="sustainability-heading"
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
            className="card border border-base-300 bg-base-100 shadow-sm"
            aria-labelledby="certifications-heading"
          >
            <div className="card-body gap-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="certifications-heading" className="card-title text-xl">
                    Certifications
                  </h2>
                  <p className="mt-1 text-sm text-base-content/70">
                    Store certification metadata only. PDF uploads are not available yet.
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

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-box border border-base-300 bg-base-100/95 p-4 shadow-lg backdrop-blur">
            <p className="text-sm text-base-content/70">
              Save sends revision {draftRevision ?? '—'}.
            </p>
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
          </div>
        </form>
      </div>
    </main>
  )
}
