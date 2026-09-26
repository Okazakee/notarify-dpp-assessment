'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl } from '../api-origin'
import { useAuth } from '../auth-context'
import { BackOfficeNav } from '../back-office-nav'
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
    typeof candidate.totalViews === 'number' &&
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
  const { request, status, user } = useAuth()
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
  // Deletion is a lifecycle change, so it asks first and reports its outcome explicitly.
  const [deleteTarget, setDeleteTarget] = useState<ProductListItem | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const loadSequence = useRef(0)
  const isAdmin = user?.role === 'ADMIN'
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

  const loadProducts = useCallback(async () => {
    // Rapid filter or page changes can leave an earlier request in flight. Each load takes a
    // sequence number and only the newest one may write state, so a slow earlier response
    // cannot overwrite newer data or clear the loading flag for a pending request.
    loadSequence.current += 1
    const sequence = loadSequence.current
    setIsLoading(true)
    setError(null)
    const query = buildListQuery(page, pageSize, appliedFilters)
    try {
      const response = await request(`/products?${query}`)
      const payload = await readApiResponse<unknown>(response)
      if (!isProductListResponse(payload)) {
        throw new ProductApiError(502, 'The API returned invalid product data.')
      }
      if (sequence === loadSequence.current) {
        setProducts(payload)
      }
    } catch (requestError) {
      if (sequence === loadSequence.current) {
        setError(describeApiError(requestError, 'Unable to load products.'))
      }
    } finally {
      if (sequence === loadSequence.current) {
        setIsLoading(false)
      }
    }
  }, [appliedFilters, page, pageSize, request])

  useEffect(() => {
    if (status !== 'signed-in') {
      return
    }
    void loadProducts()
  }, [loadProducts, status])

  const pageCount = products?.totalPages ?? 0

  /**
   * Confirms a soft delete.
   *
   * Deletion is a lifecycle change rather than a row removal, so the copy states what
   * actually happens — the product leaves the back office, its public Passport is
   * withdrawn, and history is kept — instead of implying an irreversible hard delete.
   */
  const confirmDelete = useCallback(async () => {
    if (deleteTarget === null) {
      return
    }
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const response = await request(`/products/${deleteTarget.id}`, { method: 'DELETE' })
      if (!response.ok) {
        throw new ProductApiError(response.status, 'We could not delete this product.')
      }
      setNotice(
        `Deleted ${deleteTarget.name ?? 'the product'}. Its public Passport is withdrawn and its history is retained.`,
      )
      setDeleteTarget(null)
      await loadProducts()
    } catch (deleteFailure) {
      setDeleteError(describeApiError(deleteFailure, 'We could not delete this product.'))
    } finally {
      setIsDeleting(false)
    }
  }, [deleteTarget, loadProducts, request])

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
            <BackOfficeNav />
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

        {notice !== null ? (
          <p className="alert alert-success mt-6" role="status" data-testid="product-notice">
            {notice}
          </p>
        ) : null}

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
                          {/* A measured value: zero is real now, not a placeholder. */}
                          <span data-testid="product-total-views">{product.totalViews}</span>
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
                            <Link
                              className="btn btn-xs btn-ghost focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                              href={`/products/${product.id}/view`}
                              onClick={(event) => event.stopPropagation()}
                              data-testid="product-view"
                            >
                              View
                            </Link>
                            {isAdmin ? (
                              <button
                                type="button"
                                className="btn btn-xs btn-ghost text-error focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setNotice(null)
                                  setDeleteError(null)
                                  setDeleteTarget(product)
                                }}
                                data-testid="product-delete"
                              >
                                Delete
                              </button>
                            ) : null}
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

      {deleteTarget !== null ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-product-heading"
          data-testid="product-delete-dialog"
        >
          <div className="card w-full max-w-lg border border-base-300 bg-base-100 shadow-xl">
            <div className="card-body gap-4">
              <h2 id="delete-product-heading" className="text-xl font-semibold">
                Delete this product?
              </h2>
              <p className="text-sm text-base-content/70">
                Deleting removes {deleteTarget.name ?? 'this product'} from the back office and
                withdraws its public Passport if it has one. Its immutable versions, files,
                analytics and audit history are kept, and there is no restore action.
              </p>
              {deleteError !== null ? (
                <p className="alert alert-error" role="alert">
                  {deleteError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  onClick={() => {
                    setDeleteError(null)
                    setDeleteTarget(null)
                  }}
                  disabled={isDeleting}
                  data-testid="product-delete-cancel"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-error focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  onClick={() => void confirmDelete()}
                  disabled={isDeleting}
                  data-testid="product-delete-confirm"
                >
                  {isDeleting ? 'Deleting…' : 'Delete product'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
