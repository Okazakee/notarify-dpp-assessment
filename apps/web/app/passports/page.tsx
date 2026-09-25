'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { apiUrl } from '../api-origin'
import { useAuth } from '../auth-context'
import { LogoutButton } from '../logout-button'
import { describeApiError } from '../products/api'
import { fetchPassportList } from './api'
import type { PassportListResponse } from './types'

const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [DEFAULT_PAGE_SIZE, 25, 50]

function displayValue(value: string | null): string {
  return value === null || value.trim().length === 0 ? '—' : value
}

function displayDate(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toISOString().slice(0, 10)
}

/**
 * The back-office Product Passports page.
 *
 * Every row describes what is currently published: the identity comes from the immutable
 * publication snapshot, so an unpublished draft edit never appears as the passport's
 * name. Both roles see this page and can open the public passport or download the
 * passport-level QR; only an Admin sees the history action, and the API enforces that
 * rule independently.
 *
 * There is no PDF action and no delete action here: Stage 4.5 owns PDF export and Stage 6
 * owns product lifecycle, and a button that performs nothing would be a fake feature.
 */
export default function PassportsPage() {
  const router = useRouter()
  const { request, status, user } = useAuth()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [passports, setPassports] = useState<PassportListResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'signed-out') {
      router.replace('/login')
    }
  }, [router, status])

  useEffect(() => {
    if (status !== 'signed-in') {
      return
    }

    let cancelled = false
    setIsLoading(true)
    fetchPassportList(request, page, pageSize)
      .then((result) => {
        if (!cancelled) {
          setPassports(result)
          setError(null)
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(describeApiError(requestError, 'Unable to load product passports.'))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [request, status, page, pageSize])

  if (status === 'loading' || user === null) {
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

  const isAdmin = user.role === 'ADMIN'
  const pageCount = passports?.totalPages ?? 0
  const canGoPrevious = page > 1
  const canGoNext = pageCount > 0 && page < pageCount
  const showingRange =
    passports === null || passports.total === 0
      ? 'No published passports'
      : `Showing ${(passports.page - 1) * passports.pageSize + 1}–${
          (passports.page - 1) * passports.pageSize + passports.items.length
        } of ${passports.total}`

  return (
    <main className="min-h-screen bg-base-200 p-6 sm:p-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-base-300 pb-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Notarify
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-base-content">Product Passports</h1>
            <p className="mt-1 text-sm text-base-content/70">
              What is currently published. Draft edits stay private until you republish.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/analytics"
              className="btn btn-ghost btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
            >
              Analytics
            </Link>
            <Link
              href="/products"
              className="btn btn-ghost btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
            >
              Products
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

        {error !== null ? (
          <p className="alert alert-error mt-6" role="alert">
            {error}
          </p>
        ) : null}

        <section
          className="card mt-6 border border-base-300 bg-base-100 shadow-sm"
          aria-labelledby="passports-heading"
        >
          <div className="card-body p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-5 py-4">
              <h2 id="passports-heading" className="card-title text-lg">
                Published passports
              </h2>
              <p className="text-sm text-base-content/70" aria-live="polite">
                {showingRange}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="table table-zebra">
                <caption className="sr-only">
                  Published product passports for this company. The QR code belongs to the passport
                  and stays the same across versions.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">SKU</th>
                    <th scope="col">Serial</th>
                    <th scope="col">Version</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last published</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center">
                        <span
                          className="loading loading-spinner loading-md text-primary"
                          role="status"
                          aria-label="Loading product passports"
                        />
                      </td>
                    </tr>
                  ) : passports === null || passports.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-base-content/70">
                        No passports are published yet. Publish a product draft to create one.
                      </td>
                    </tr>
                  ) : (
                    passports.items.map((passport) => (
                      <tr key={passport.passportId} data-testid="passport-row">
                        <th scope="row" className="font-medium">
                          <span data-testid="passport-row-name">
                            {displayValue(passport.product.name)}
                          </span>
                          <span className="mt-1 block font-mono text-xs text-base-content/60">
                            {passport.publicUuid}
                          </span>
                        </th>
                        <td>{displayValue(passport.product.sku)}</td>
                        <td>{displayValue(passport.product.serialNumber)}</td>
                        <td>v{passport.currentVersionNumber}</td>
                        <td>
                          <div className="flex flex-col items-start gap-1">
                            <span className="badge badge-success">Published</span>
                            {passport.hasUnpublishedChanges ? (
                              <span
                                className="badge badge-warning badge-sm"
                                data-testid="unpublished-changes"
                              >
                                Unpublished changes
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>{displayDate(passport.currentPublishedAt)}</td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            <a
                              className="btn btn-xs btn-outline focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                              href={passport.publicUrl}
                              target="_blank"
                              rel="noreferrer"
                              data-testid="open-passport"
                            >
                              Open Passport
                            </a>
                            <a
                              className="btn btn-xs btn-outline focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                              href={apiUrl(passport.qrDownloadUrl)}
                              data-testid="download-qr"
                            >
                              Download QR
                            </a>
                            <a
                              className="btn btn-xs btn-outline focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                              href={apiUrl(passport.pdfDownloadUrl)}
                              data-testid="download-pdf"
                            >
                              Download PDF
                            </a>
                            <Link
                              className="btn btn-xs btn-ghost focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                              href={`/products/${passport.productId}`}
                            >
                              Edit Product
                            </Link>
                            {isAdmin ? (
                              <Link
                                className="btn btn-xs btn-ghost focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                                href={`/passports/${passport.passportId}`}
                                data-testid="version-history"
                              >
                                Version History
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 px-5 py-4">
              <label className="flex items-center gap-2 text-sm" htmlFor="passport-page-size">
                <span>Rows per page</span>
                <select
                  id="passport-page-size"
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
                <legend className="sr-only">Passport pages</legend>
                <button
                  type="button"
                  className="btn btn-sm join-item focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={!canGoPrevious}
                >
                  Previous
                </button>
                <span className="btn btn-sm join-item pointer-events-none" aria-live="polite">
                  Page {passports?.page ?? page} of {pageCount || 1}
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
