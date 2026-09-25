'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../api-origin'
import { useAuth } from '../auth-context'
import { LogoutButton } from '../logout-button'
import { useAssetObjectUrls } from '../passport/use-asset-object-urls'
import { describeApiError, ProductApiError, readApiResponse } from './api'
import type {
  Category,
  ProductDetail,
  ProductListItem,
  ProductListResponse,
  ProductPassportSummary,
} from './types'

const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [DEFAULT_PAGE_SIZE, 25, 50]

type ProductFilters = {
  categoryId: string
  originCountry: string
  productionFrom: string
  productionTo: string
  q: string
}

const EMPTY_FILTERS: ProductFilters = {
  categoryId: '',
  originCountry: '',
  productionFrom: '',
  productionTo: '',
  q: '',
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

function isProductPassportSummary(value: unknown): value is ProductPassportSummary {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<ProductPassportSummary>
  return (
    typeof candidate.publicUuid === 'string' &&
    typeof candidate.publicUrl === 'string' &&
    typeof candidate.qrDownloadUrl === 'string' &&
    typeof candidate.currentVersionNumber === 'number' &&
    typeof candidate.sourceDraftRevision === 'number' &&
    typeof candidate.hasUnpublishedChanges === 'boolean' &&
    typeof candidate.currentPublishedAt === 'string'
  )
}

function isProductListItem(value: unknown): value is ProductListItem {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<ProductListItem>
  return (
    typeof candidate.id === 'string' &&
    (candidate.name === null || typeof candidate.name === 'string') &&
    (candidate.sku === null || typeof candidate.sku === 'string') &&
    (candidate.serialNumber === null || typeof candidate.serialNumber === 'string') &&
    (candidate.categoryId === null || typeof candidate.categoryId === 'string') &&
    (candidate.categoryName === null || typeof candidate.categoryName === 'string') &&
    (candidate.status === 'DRAFT' || candidate.status === 'PUBLISHED') &&
    typeof candidate.draftRevision === 'number' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    (candidate.coverImageAssetId === null || typeof candidate.coverImageAssetId === 'string') &&
    (candidate.passport === null || isProductPassportSummary(candidate.passport))
  )
}

function isProductListResponse(value: unknown): value is ProductListResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<ProductListResponse>
  return (
    Array.isArray(candidate.items) &&
    candidate.items.every(isProductListItem) &&
    typeof candidate.page === 'number' &&
    typeof candidate.pageSize === 'number' &&
    typeof candidate.total === 'number' &&
    typeof candidate.totalPages === 'number'
  )
}

function displayValue(value: string | null): string {
  return value === null || value.trim().length === 0 ? '—' : value
}

function displayDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date)
}

function buildListQuery(page: number, pageSize: number, filters: ProductFilters): string {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  const entries: Array<[string, string]> = [
    ['categoryId', filters.categoryId],
    ['originCountry', filters.originCountry.trim().toUpperCase()],
    ['productionFrom', filters.productionFrom],
    ['productionTo', filters.productionTo],
    ['q', filters.q.trim()],
  ]
  for (const [key, value] of entries) {
    if (value.length > 0) {
      params.set(key, value)
    }
  }
  return params.toString()
}

export default function ProductsPage() {
  const router = useRouter()
  const { request, status } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [filters, setFilters] = useState<ProductFilters>(EMPTY_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<ProductFilters>(EMPTY_FILTERS)
  const [products, setProducts] = useState<ProductListResponse | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categoriesError, setCategoriesError] = useState<string | null>(null)

  // Only the ids are fetched, and only for the rows on this bounded page, so a page of
  // products costs one authenticated request per cover instead of one per row per render.
  const coverAssetIds = useMemo(
    () =>
      products === null
        ? []
        : products.items.flatMap((product) =>
            product.coverImageAssetId === null ? [] : [product.coverImageAssetId],
          ),
    [products],
  )
  const coverUrls = useAssetObjectUrls(request, coverAssetIds)

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
    setCategoriesError(null)
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
          setCategoriesError(describeApiError(requestError, 'Unable to load categories.'))
        }
      })

    return () => {
      active = false
    }
  }, [request, status])

  useEffect(() => {
    if (status !== 'signed-in') {
      return
    }

    let active = true
    setIsLoading(true)
    setError(null)
    const query = buildListQuery(page, pageSize, appliedFilters)
    void request(`/products?${query}`)
      .then((response) => readApiResponse<unknown>(response))
      .then((payload) => {
        if (!isProductListResponse(payload)) {
          throw new ProductApiError(502, 'The API returned invalid product data.')
        }
        if (active) {
          setProducts(payload)
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(describeApiError(requestError, 'Unable to load products.'))
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [appliedFilters, page, pageSize, request, status])

  const pageCount = products?.totalPages ?? 0
  const canGoPrevious = page > 1 && !isLoading
  const canGoNext = pageCount > 0 && page < pageCount && !isLoading
  const showingRange = useMemo(() => {
    if (products === null || products.total === 0) {
      return 'No products to display'
    }
    const first = (products.page - 1) * products.pageSize + 1
    const last = Math.min(products.page * products.pageSize, products.total)
    return `Showing ${first}–${last} of ${products.total}`
  }, [products])

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAppliedFilters({ ...filters, originCountry: filters.originCountry.toUpperCase() })
    setPage(1)
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
    setAppliedFilters(EMPTY_FILTERS)
    setPage(1)
  }

  async function handleCreate() {
    setIsCreating(true)
    setError(null)
    try {
      const response = await request('/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const created = await readApiResponse<unknown>(response)
      if (
        typeof created !== 'object' ||
        created === null ||
        typeof (created as ProductDetail).id !== 'string'
      ) {
        throw new ProductApiError(502, 'The API returned invalid product data.')
      }
      router.push(`/products/${(created as ProductDetail).id}`)
    } catch (requestError: unknown) {
      setError(describeApiError(requestError, 'Unable to create a product.'))
    } finally {
      setIsCreating(false)
    }
  }

  if (status === 'loading') {
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

  return (
    <main className="min-h-screen bg-base-200 p-4 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-base-300 pb-5">
          <div>
            <Link
              href="/"
              className="text-sm font-semibold uppercase tracking-[0.18em] text-primary"
            >
              Notarify
            </Link>
            <h1 className="mt-2 text-3xl font-semibold text-base-content">Products</h1>
            <p className="mt-1 text-sm text-base-content/70">Create and maintain product drafts.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/passports"
              className="btn btn-ghost btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
            >
              Product Passports
            </Link>
            <Link
              href="/"
              className="btn btn-ghost btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
            >
              Workspace
            </Link>
            <LogoutButton />
          </div>
        </header>

        <section
          className="card mt-6 border border-base-300 bg-base-100 shadow-sm"
          aria-labelledby="filter-heading"
        >
          <div className="card-body p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="filter-heading" className="card-title text-lg">
                Find products
              </h2>
              <button
                type="button"
                className="btn btn-primary focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                onClick={() => void handleCreate()}
                disabled={isCreating}
              >
                {isCreating ? (
                  <span className="loading loading-spinner loading-sm" aria-hidden="true" />
                ) : null}
                {isCreating ? 'Creating...' : 'Create product'}
              </button>
            </div>
            <form
              className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-5"
              onSubmit={handleFilterSubmit}
            >
              <div className="form-control lg:col-span-2">
                <label className="label" htmlFor="product-query">
                  <span className="label-text font-medium">Text query</span>
                </label>
                <input
                  id="product-query"
                  type="search"
                  value={filters.q}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, q: event.target.value }))
                  }
                  placeholder="Name, SKU, or serial"
                  className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                />
              </div>
              <div className="form-control">
                <label className="label" htmlFor="product-category">
                  <span className="label-text font-medium">Category</span>
                </label>
                <select
                  id="product-category"
                  value={filters.categoryId}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, categoryId: event.target.value }))
                  }
                  className="select select-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                >
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-control">
                <label className="label" htmlFor="product-origin">
                  <span className="label-text font-medium">Origin country</span>
                </label>
                <input
                  id="product-origin"
                  type="text"
                  value={filters.originCountry}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      originCountry: event.target.value.toUpperCase(),
                    }))
                  }
                  maxLength={2}
                  pattern="[A-Z]{2}"
                  placeholder="US"
                  className="input input-bordered w-full uppercase focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                />
              </div>
              <div className="form-control">
                <label className="label" htmlFor="production-from">
                  <span className="label-text font-medium">Production from</span>
                </label>
                <input
                  id="production-from"
                  type="date"
                  value={filters.productionFrom}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, productionFrom: event.target.value }))
                  }
                  className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                />
              </div>
              <div className="form-control">
                <label className="label" htmlFor="production-to">
                  <span className="label-text font-medium">Production to</span>
                </label>
                <input
                  id="production-to"
                  type="date"
                  value={filters.productionTo}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, productionTo: event.target.value }))
                  }
                  className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                />
              </div>
              <div className="flex items-end gap-2 md:col-span-2 lg:col-span-5">
                <button
                  type="submit"
                  className="btn btn-secondary focus:outline-2 focus:outline-offset-2 focus:outline-secondary"
                >
                  Apply filters
                </button>
                <button
                  type="button"
                  className="btn btn-ghost focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  onClick={clearFilters}
                >
                  Clear
                </button>
              </div>
            </form>
            {categoriesError !== null ? (
              <p className="mt-3 text-sm text-error" role="alert">
                {categoriesError}
              </p>
            ) : null}
          </div>
        </section>

        {error !== null ? (
          <p className="alert alert-error mt-6" role="alert">
            {error}
          </p>
        ) : null}

        <section
          className="card mt-6 border border-base-300 bg-base-100 shadow-sm"
          aria-labelledby="products-heading"
        >
          <div className="card-body p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-5 py-4">
              <h2 id="products-heading" className="card-title text-lg">
                Product drafts
              </h2>
              <p className="text-sm text-base-content/70" aria-live="polite">
                {showingRange}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="table table-zebra">
                <caption className="sr-only">Products in this company</caption>
                <thead>
                  <tr>
                    <th scope="col">Cover</th>
                    <th scope="col">Name</th>
                    <th scope="col">SKU</th>
                    <th scope="col">Serial</th>
                    <th scope="col">Category</th>
                    <th scope="col">Status</th>
                    <th scope="col">QR</th>
                    <th scope="col">Total views</th>
                    <th scope="col">Updated</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center">
                        <span
                          className="loading loading-spinner loading-md text-primary"
                          role="status"
                          aria-label="Loading products"
                        />
                      </td>
                    </tr>
                  ) : products === null || products.items.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-base-content/70">
                        No products match these filters.
                      </td>
                    </tr>
                  ) : (
                    products.items.map((product) => (
                      <tr
                        key={product.id}
                        tabIndex={0}
                        className="cursor-pointer focus:outline-2 focus:outline-offset-[-2px] focus:outline-primary"
                        onClick={() => router.push(`/products/${product.id}`)}
                        onKeyDown={(event) => {
                          // Action controls live inside this row. Only a key pressed on the
                          // row itself navigates, so tabbing to an action never opens the
                          // editor by accident.
                          if (event.target !== event.currentTarget) {
                            return
                          }
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            router.push(`/products/${product.id}`)
                          }
                        }}
                      >
                        <td>
                          {product.coverImageAssetId !== null &&
                          coverUrls[product.coverImageAssetId] !== undefined ? (
                            // biome-ignore lint/performance/noImgElement: draft cover bytes are private blob: object URLs, which the Next image optimiser cannot fetch or optimise.
                            <img
                              src={coverUrls[product.coverImageAssetId]}
                              alt=""
                              width={40}
                              height={40}
                              className="h-10 w-10 rounded object-cover"
                              data-testid="product-cover"
                            />
                          ) : (
                            <span
                              className="flex h-10 w-10 items-center justify-center rounded bg-base-200 text-base-content/40"
                              aria-hidden="true"
                            >
                              —
                            </span>
                          )}
                        </td>
                        <th scope="row" className="font-medium">
                          {displayValue(product.name)}
                        </th>
                        <td>{displayValue(product.sku)}</td>
                        <td>{displayValue(product.serialNumber)}</td>
                        <td>{displayValue(product.categoryName)}</td>
                        <td>
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={`badge ${product.status === 'PUBLISHED' ? 'badge-success' : 'badge-warning'}`}
                            >
                              {product.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                            </span>
                            {product.passport?.hasUnpublishedChanges === true ? (
                              <span
                                className="badge badge-warning badge-sm"
                                data-testid="product-unpublished-changes"
                              >
                                Unpublished changes
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          {product.passport === null ? (
                            <span className="text-base-content/40">
                              <span aria-hidden="true">—</span>
                              <span className="sr-only">No QR code until published</span>
                            </span>
                          ) : (
                            <a
                              className="link link-primary text-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                              href={apiUrl(product.passport.qrDownloadUrl)}
                              onClick={(event) => event.stopPropagation()}
                              data-testid="product-qr-download"
                            >
                              QR
                            </a>
                          )}
                        </td>
                        <td>
                          {/* Analytics is Stage 5; a placeholder is honest, an invented 0 is not. */}
                          <span className="text-base-content/40" data-testid="product-total-views">
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">Available after analytics</span>
                          </span>
                        </td>
                        <td>{displayDate(product.updatedAt)}</td>
                        <td>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              className="btn btn-xs btn-ghost focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                              href={`/products/${product.id}`}
                              onClick={(event) => event.stopPropagation()}
                              data-testid="product-edit"
                            >
                              Edit
                            </Link>
                            {product.passport === null ? (
                              <span
                                className="text-xs text-base-content/50"
                                data-testid="product-not-published"
                              >
                                Publish to enable passport actions
                              </span>
                            ) : (
                              <>
                                <a
                                  className="btn btn-xs btn-outline focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                                  href={product.passport.publicUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                  data-testid="product-open-passport"
                                >
                                  Open Passport
                                </a>
                                <a
                                  className="btn btn-xs btn-outline focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                                  href={apiUrl(product.passport.qrDownloadUrl)}
                                  onClick={(event) => event.stopPropagation()}
                                  data-testid="product-download-qr"
                                >
                                  Download QR
                                </a>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 px-5 py-4">
              <label className="flex items-center gap-2 text-sm" htmlFor="page-size">
                <span>Rows per page</span>
                <select
                  id="page-size"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value))
                    setPage(1)
                  }}
                  className="select select-bordered select-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="join">
                <legend className="sr-only">Product pages</legend>
                <button
                  type="button"
                  className="btn btn-sm join-item focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={!canGoPrevious}
                >
                  Previous
                </button>
                <span className="btn btn-sm join-item pointer-events-none" aria-live="polite">
                  Page {products?.page ?? page} of {pageCount || 1}
                </span>
                <button
                  type="button"
                  className="btn btn-sm join-item focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  disabled={!canGoNext}
                >
                  Next
                </button>
              </fieldset>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
