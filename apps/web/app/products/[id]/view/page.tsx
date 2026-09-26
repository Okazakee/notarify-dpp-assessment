'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../auth-context'
import { BackOfficeNav } from '../../../back-office-nav'
import { useAssetObjectUrls } from '../../../passport/use-asset-object-urls'
import { readApiResponse } from '../../api'
import type { ProductDetail } from '../../types'

/**
 * The read-only private Product view.
 *
 * This is deliberately the **current draft** product, not the published Passport: an
 * unpublished product has no Passport at all, and a saved edit that has not been
 * republished differs from what the public page shows. The two destinations stay separate
 * — `Open Passport` is the immutable published version, this page is the operator's own
 * record — and the page says so rather than leaving the reader to guess.
 *
 * It renders the same data the editor loads, through semantic sections and tables, and
 * carries no editing control: the only action is an explicit `Edit Product`.
 */

function formatDate(value: string | null): string {
  return value === null || value.length === 0 ? '—' : value
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ProductViewPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const productId = params?.id ?? ''
  const { status, request } = useAuth()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const response = await request(`/products/${productId}`)
      setProduct(await readApiResponse<ProductDetail>(response))
    } catch {
      setError('We could not load this product.')
    }
  }, [productId, request])

  useEffect(() => {
    if (status === 'signed-out') {
      router.replace('/login')
      return
    }
    if (status !== 'signed-in') {
      return
    }
    void load()
  }, [load, router, status])

  const imageIds = product?.images.map((image) => image.assetId) ?? []
  const fileIds = [
    ...(product?.documents.map((document) => document.assetId) ?? []),
    ...(product?.certifications.flatMap((certification) =>
      certification.pdfAssetId === null ? [] : [certification.pdfAssetId],
    ) ?? []),
  ]
  const imageUrls = useAssetObjectUrls(request, imageIds)
  const fileUrls = useAssetObjectUrls(request, fileIds)

  if (status === 'loading' || (status === 'signed-in' && product === null && error === null)) {
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
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-base-300 pb-5">
          <div>
            <Link
              href="/"
              className="text-sm font-semibold uppercase tracking-[0.18em] text-primary"
            >
              Notarify
            </Link>
            <h1 className="mt-2 text-3xl font-semibold text-base-content">
              {product?.name ?? 'Product'}
            </h1>
            <p className="mt-1 text-sm text-base-content/70">
              Read-only view of the current product record. This is not the published Passport.
            </p>
          </div>
          <BackOfficeNav />
        </header>

        {error !== null ? (
          <div className="mt-8">
            <p className="alert alert-error" role="alert">
              {error}
            </p>
            <button
              type="button"
              className="btn btn-primary mt-4 focus:outline-2 focus:outline-offset-2 focus:outline-primary"
              onClick={() => void load()}
            >
              Try again
            </button>
          </div>
        ) : null}

        {product !== null ? (
          <div className="mt-8 space-y-8">
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/products/${product.id}`}
                data-testid="product-view-edit"
                className="btn btn-primary btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
              >
                Edit Product
              </Link>
              <Link
                href="/products"
                className="btn btn-ghost btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
              >
                Back to Products
              </Link>
            </div>

            <section
              aria-labelledby="status-heading"
              className="card border border-base-300 bg-base-100 shadow-sm"
            >
              <div className="card-body p-5">
                <h2 id="status-heading" className="text-xl font-semibold">
                  Status
                </h2>
                <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-sm text-base-content/70">Publication status</dt>
                    <dd data-testid="product-view-status" className="mt-1 font-medium">
                      {product.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-base-content/70">Total Views</dt>
                    <dd data-testid="product-view-total-views" className="mt-1 font-medium">
                      {product.totalViews}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-base-content/70">Draft revision</dt>
                    <dd className="mt-1 font-medium">{product.draftRevision}</dd>
                  </div>
                </dl>
                {product.passport !== null ? (
                  <p className="mt-3 text-sm text-base-content/70">
                    The published Passport is at version {product.passport.currentVersionNumber}
                    {product.passport.hasUnpublishedChanges
                      ? ', and this product has changes that are not published yet.'
                      : '.'}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-base-content/70">
                    This product has not been published, so it has no public Passport yet.
                  </p>
                )}
              </div>
            </section>

            <section
              aria-labelledby="general-heading"
              className="card border border-base-300 bg-base-100 shadow-sm"
            >
              <div className="card-body p-5">
                <h2 id="general-heading" className="text-xl font-semibold">
                  General Information
                </h2>
                <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm text-base-content/70">Name</dt>
                    <dd className="mt-1">{product.name ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-base-content/70">SKU</dt>
                    <dd className="mt-1">{product.sku ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-base-content/70">Serial number</dt>
                    <dd className="mt-1">{product.serialNumber ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-base-content/70">Category</dt>
                    <dd className="mt-1">{product.categoryName ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-base-content/70">Production date</dt>
                    <dd className="mt-1">{formatDate(product.productionDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-base-content/70">Country of origin</dt>
                    <dd className="mt-1">{product.originCountry ?? '—'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-base-content/70">Description</dt>
                    <dd className="mt-1 whitespace-pre-wrap">{product.description ?? '—'}</dd>
                  </div>
                </dl>
              </div>
            </section>

            <section
              aria-labelledby="materials-heading"
              className="card border border-base-300 bg-base-100 shadow-sm"
            >
              <div className="card-body p-5">
                <h2 id="materials-heading" className="text-xl font-semibold">
                  Materials
                </h2>
                {product.materials.length === 0 ? (
                  <p className="mt-3 text-base-content/70">No materials recorded.</p>
                ) : (
                  <table className="table mt-3" data-testid="product-view-materials">
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Percentage</th>
                        <th scope="col">Origin</th>
                        <th scope="col">Recyclable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.materials.map((material) => (
                        <tr key={material.id}>
                          <th scope="row" className="font-normal">
                            {material.name}
                          </th>
                          <td>{material.percentage}%</td>
                          <td>{material.originCountry ?? '—'}</td>
                          <td>
                            {material.recyclable === null
                              ? '—'
                              : material.recyclable
                                ? 'Yes'
                                : 'No'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section
              aria-labelledby="sustainability-heading"
              className="card border border-base-300 bg-base-100 shadow-sm"
            >
              <div className="card-body p-5">
                <h2 id="sustainability-heading" className="text-xl font-semibold">
                  Sustainability
                </h2>
                {product.sustainability === null ? (
                  <p className="mt-3 text-base-content/70">No sustainability data recorded.</p>
                ) : (
                  <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <dt className="text-sm text-base-content/70">Carbon footprint (kg CO₂e)</dt>
                      <dd className="mt-1">{product.sustainability.carbonKgCo2e ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-base-content/70">Water use (litres)</dt>
                      <dd className="mt-1">{product.sustainability.waterLitres ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-base-content/70">Recycled material (%)</dt>
                      <dd className="mt-1">{product.sustainability.recycledPercent ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-base-content/70">Repairability score</dt>
                      <dd className="mt-1">{product.sustainability.repairabilityScore ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-base-content/70">Recyclable</dt>
                      <dd className="mt-1">
                        {product.sustainability.recyclable === null
                          ? '—'
                          : product.sustainability.recyclable
                            ? 'Yes'
                            : 'No'}
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            </section>

            <section
              aria-labelledby="certifications-heading"
              className="card border border-base-300 bg-base-100 shadow-sm"
            >
              <div className="card-body p-5">
                <h2 id="certifications-heading" className="text-xl font-semibold">
                  Certifications
                </h2>
                {product.certifications.length === 0 ? (
                  <p className="mt-3 text-base-content/70">No certifications recorded.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {product.certifications.map((certification) => (
                      <li
                        key={certification.id}
                        className="border-b border-base-200 pb-3 last:border-0"
                      >
                        <p className="font-medium">
                          {certification.name ?? 'Unnamed certification'}
                        </p>
                        <p className="text-sm text-base-content/70">
                          {certification.issuingAuthority ?? 'Unknown authority'} · issued{' '}
                          {formatDate(certification.issueDate)} · expires{' '}
                          {formatDate(certification.expirationDate)}
                        </p>
                        {certification.pdfAssetId !== null && fileUrls[certification.pdfAssetId] ? (
                          <a
                            className="link link-primary text-sm"
                            href={fileUrls[certification.pdfAssetId]}
                            download={certification.pdfAsset?.originalName ?? undefined}
                          >
                            Download certificate
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section
              aria-labelledby="documents-heading"
              className="card border border-base-300 bg-base-100 shadow-sm"
            >
              <div className="card-body p-5">
                <h2 id="documents-heading" className="text-xl font-semibold">
                  Documents
                </h2>
                {product.documents.length === 0 ? (
                  <p className="mt-3 text-base-content/70">No documents recorded.</p>
                ) : (
                  <table className="table mt-3" data-testid="product-view-documents">
                    <thead>
                      <tr>
                        <th scope="col">Title</th>
                        <th scope="col">Kind</th>
                        <th scope="col">File</th>
                        <th scope="col">Size</th>
                        <th scope="col">Download</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.documents.map((document) => (
                        <tr key={document.id}>
                          <th scope="row" className="font-normal">
                            {document.title ?? 'Untitled document'}
                          </th>
                          <td>{document.kind}</td>
                          <td>{document.asset.originalName}</td>
                          <td>{formatBytes(document.asset.sizeBytes)}</td>
                          <td>
                            {fileUrls[document.assetId] ? (
                              <a
                                className="link link-primary"
                                href={fileUrls[document.assetId]}
                                download={document.asset.originalName}
                              >
                                Download
                              </a>
                            ) : (
                              <span className="text-base-content/50">Preparing…</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section
              aria-labelledby="images-heading"
              className="card border border-base-300 bg-base-100 shadow-sm"
            >
              <div className="card-body p-5">
                <h2 id="images-heading" className="text-xl font-semibold">
                  Images
                </h2>
                {product.images.length === 0 ? (
                  <p className="mt-3 text-base-content/70">No images recorded.</p>
                ) : (
                  <ul
                    className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3"
                    data-testid="product-view-images"
                  >
                    {product.images.map((image) => (
                      <li key={image.id}>
                        {imageUrls[image.assetId] ? (
                          // Private bytes through the authenticated asset route as an
                          // object URL, never a public URL.
                          // biome-ignore lint/performance/noImgElement: the image bytes are a private blob: object URL, which the Next image optimiser cannot fetch or optimise.
                          <img
                            src={imageUrls[image.assetId]}
                            alt={image.altText ?? `${image.role.toLowerCase()} image`}
                            className="h-32 w-full rounded border border-base-300 object-cover"
                          />
                        ) : (
                          <span className="flex h-32 w-full items-center justify-center rounded border border-base-300 text-sm text-base-content/50">
                            Preparing…
                          </span>
                        )}
                        <p className="mt-1 text-sm text-base-content/70">
                          {image.role === 'COVER' ? 'Cover' : 'Gallery'} ·{' '}
                          {image.asset.originalName}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  )
}
