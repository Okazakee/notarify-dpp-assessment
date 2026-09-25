'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api-origin'
import { useAuth } from '../../auth-context'
import { LogoutButton } from '../../logout-button'
import { PassportPresentation } from '../../passport/presentation'
import { usePassportVersionAssetObjectUrls } from '../../passport/use-asset-object-urls'
import { describeApiError, ProductApiError } from '../../products/api'
import { fetchHistoricalPassportView, fetchPassportVersions } from '../api'
import { historicalAssetIds, toHistoricalPresentationModel } from '../historical'
import type { HistoricalPassportView, PassportVersionsResponse } from '../types'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: PassportVersionsResponse }
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }

type VersionState =
  | { kind: 'loading' }
  | { kind: 'ready'; view: HistoricalPassportView }
  | { kind: 'error'; message: string }

function displayValue(value: string | null): string {
  return value === null || value.trim().length === 0 ? '—' : value
}

function displayDate(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toISOString().slice(0, 10)
}

/**
 * Admin-only inspection of a passport's retained versions.
 *
 * Every version shown here is read from its own immutable stored snapshot, so v1 keeps
 * showing what was published as v1 even after later republishes and unpublished draft
 * edits. The shared `PassportPresentation` renders the selected version exactly as it was
 * published; the surrounding chrome exists to say that this is history and that the
 * anonymous public URL still serves the current version.
 *
 * Editor access is refused by the API, not just hidden here. This page renders a clear
 * unavailable state for that refusal instead of pretending the passport is missing.
 */
export default function PassportHistoryPage() {
  const router = useRouter()
  const params = useParams<{ passportId: string }>()
  const passportId = typeof params.passportId === 'string' ? params.passportId : ''
  const { request, status, user } = useAuth()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [versionState, setVersionState] = useState<VersionState>({ kind: 'loading' })

  useEffect(() => {
    if (status === 'signed-out') {
      router.replace('/login')
    }
  }, [router, status])

  useEffect(() => {
    if (status !== 'signed-in' || passportId.length === 0) {
      return
    }

    let cancelled = false
    setState({ kind: 'loading' })
    fetchPassportVersions(request, passportId)
      .then((data) => {
        if (cancelled) {
          return
        }
        setState({ kind: 'ready', data })
        // Default to what the public URL serves today, so the first thing shown is never
        // mistaken for the anonymous projection.
        const current = data.versions.find((version) => version.isCurrent) ?? data.versions[0]
        setSelectedVersion(current === undefined ? null : current.versionNumber)
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }
        if (error instanceof ProductApiError && error.status === 403) {
          setState({ kind: 'forbidden' })
          return
        }
        if (error instanceof ProductApiError && error.status === 404) {
          setState({ kind: 'not-found' })
          return
        }
        setState({
          kind: 'error',
          message: describeApiError(error, 'Unable to load the version history.'),
        })
      })

    return () => {
      cancelled = true
    }
  }, [passportId, request, status])

  useEffect(() => {
    if (status !== 'signed-in' || passportId.length === 0 || selectedVersion === null) {
      return
    }

    let cancelled = false
    setVersionState({ kind: 'loading' })
    fetchHistoricalPassportView(request, passportId, selectedVersion)
      .then((view) => {
        if (!cancelled) {
          setVersionState({ kind: 'ready', view })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setVersionState({
            kind: 'error',
            message: describeApiError(error, 'Unable to load that retained version.'),
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [passportId, request, selectedVersion, status])

  const view = versionState.kind === 'ready' ? versionState.view : null
  const assetIds = useMemo(() => (view === null ? [] : historicalAssetIds(view)), [view])
  const objectUrls = usePassportVersionAssetObjectUrls(
    request,
    passportId,
    selectedVersion ?? 0,
    assetIds,
  )
  const model = useMemo(
    () => (view === null ? null : toHistoricalPresentationModel(view, objectUrls)),
    [view, objectUrls],
  )

  const selectVersion = useCallback((versionNumber: number) => {
    setSelectedVersion(versionNumber)
  }, [])

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

  if (state.kind === 'forbidden') {
    return (
      <main className="min-h-screen bg-base-200 p-6 sm:p-10">
        <div className="mx-auto max-w-3xl">
          <div className="card border border-base-300 bg-base-100 shadow-sm" role="alert">
            <div className="card-body">
              <h1 className="card-title text-xl">Version history is not available</h1>
              <p className="text-sm text-base-content/70">
                Inspecting retained passport versions is an administrator capability. You can still
                open the current published passport and download its QR code from Product Passports.
              </p>
              <div className="card-actions mt-2">
                <Link
                  href="/passports"
                  className="btn btn-primary btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                >
                  Back to Product Passports
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (state.kind === 'not-found') {
    return (
      <main className="min-h-screen bg-base-200 p-6 sm:p-10">
        <div className="mx-auto max-w-3xl">
          <div className="card border border-base-300 bg-base-100 shadow-sm" role="alert">
            <div className="card-body">
              <h1 className="card-title text-xl">Passport not found</h1>
              <p className="text-sm text-base-content/70">
                This passport does not exist for your company.
              </p>
              <div className="card-actions mt-2">
                <Link
                  href="/passports"
                  className="btn btn-primary btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                >
                  Back to Product Passports
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    )
  }

  const data = state.kind === 'ready' ? state.data : null
  const currentVersionNumber = data?.passport.currentVersionNumber ?? null
  const isSelectedCurrent =
    view !== null && currentVersionNumber !== null && view.passport.version === currentVersionNumber

  return (
    <main className="min-h-screen bg-base-200 p-6 sm:p-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-base-300 pb-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Notarify
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-base-content">
              Passport version history
            </h1>
            <p className="mt-1 text-sm text-base-content/70">
              Retained immutable versions. The public URL always shows the current version.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/passports"
              className="btn btn-ghost btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
            >
              Product Passports
            </Link>
            <LogoutButton />
          </div>
        </header>

        {state.kind === 'error' ? (
          <p className="alert alert-error mt-6" role="alert">
            {state.message}
          </p>
        ) : null}
        {state.kind === 'loading' ? (
          <div className="mt-10 flex justify-center">
            <span
              className="loading loading-spinner loading-md text-primary"
              role="status"
              aria-label="Loading version history"
            />
          </div>
        ) : null}

        {data !== null ? (
          <>
            <section
              className="card mt-6 border border-base-300 bg-base-100 shadow-sm"
              aria-labelledby="passport-identity-heading"
            >
              <div className="card-body">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 id="passport-identity-heading" className="card-title text-lg">
                      {displayValue(data.passport.product.name)}
                    </h2>
                    <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                      <div className="flex gap-2">
                        <dt className="text-base-content/60">SKU</dt>
                        <dd>{displayValue(data.passport.product.sku)}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-base-content/60">Serial</dt>
                        <dd>{displayValue(data.passport.product.serialNumber)}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-base-content/60">Public UUID</dt>
                        <dd className="font-mono text-xs" data-testid="history-public-uuid">
                          {data.passport.publicUuid}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-base-content/60">Current version</dt>
                        <dd data-testid="history-current-version">
                          v{data.passport.currentVersionNumber}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-base-content/60">First published</dt>
                        <dd>{displayDate(data.passport.firstPublishedAt)}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-base-content/60">Last published</dt>
                        <dd>{displayDate(data.passport.currentPublishedAt)}</dd>
                      </div>
                    </dl>
                    {data.passport.hasUnpublishedChanges ? (
                      <p className="mt-3 text-sm text-warning-content">
                        <span className="badge badge-warning badge-sm">Unpublished changes</span>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      className="btn btn-sm btn-outline focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                      href={data.passport.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open current Passport
                    </a>
                    <a
                      className="btn btn-sm btn-outline focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                      href={apiUrl(data.passport.qrDownloadUrl)}
                      data-testid="history-qr-download"
                    >
                      Download QR
                    </a>
                  </div>
                </div>
                <p className="mt-4 text-xs text-base-content/60">
                  The QR code belongs to the passport, not to a version, so a printed code keeps
                  working across every past and future version.
                </p>
              </div>
            </section>

            <section
              className="card mt-6 border border-base-300 bg-base-100 shadow-sm"
              aria-labelledby="version-list-heading"
            >
              <div className="card-body">
                <h2 id="version-list-heading" className="card-title text-lg">
                  Retained versions
                </h2>
                <div className="overflow-x-auto">
                  <table className="table table-zebra">
                    <caption className="sr-only">
                      Every immutable version retained for this passport, newest first.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Version</th>
                        <th scope="col">Published</th>
                        <th scope="col">Source draft revision</th>
                        <th scope="col">Status</th>
                        <th scope="col">Inspect</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.versions.map((version) => (
                        <tr key={version.versionNumber}>
                          <th scope="row">v{version.versionNumber}</th>
                          <td>{displayDate(version.publishedAt)}</td>
                          <td>{version.sourceDraftRevision}</td>
                          <td>
                            {version.isCurrent ? (
                              <span className="badge badge-success badge-sm">Current</span>
                            ) : (
                              <span className="badge badge-ghost badge-sm">Retained</span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`btn btn-xs focus:outline-2 focus:outline-offset-2 focus:outline-primary ${
                                selectedVersion === version.versionNumber
                                  ? 'btn-primary'
                                  : 'btn-outline'
                              }`}
                              onClick={() => selectVersion(version.versionNumber)}
                              aria-pressed={selectedVersion === version.versionNumber}
                              data-testid={`select-version-${version.versionNumber}`}
                            >
                              {selectedVersion === version.versionNumber ? 'Selected' : 'Inspect'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <div className="mt-8">
              {versionState.kind === 'loading' ? (
                <div className="flex justify-center py-10">
                  <span
                    className="loading loading-spinner loading-md text-primary"
                    role="status"
                    aria-label="Loading the selected version"
                  />
                </div>
              ) : null}
              {versionState.kind === 'error' ? (
                <p className="alert alert-error" role="alert">
                  {versionState.message}
                </p>
              ) : null}
              {view !== null && model !== null ? (
                <>
                  <div
                    className="rounded-box border border-base-300 bg-base-100 px-4 py-3"
                    data-testid="history-chrome"
                  >
                    <p className="font-medium">
                      Historical version v{view.passport.version}
                      {isSelectedCurrent ? ' (current)' : ''}
                    </p>
                    <p className="mt-1 text-sm text-base-content/70">
                      {isSelectedCurrent
                        ? 'This is what the public URL serves today.'
                        : `This is retained history. The public URL currently shows v${view.passport.currentVersionNumber}.`}
                    </p>
                  </div>
                  <div className="mt-6">
                    <PassportPresentation model={model} />
                  </div>
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </main>
  )
}
