'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth-context'
import { BackOfficeNav } from '../back-office-nav'
import { fetchAnalytics } from './api'
import { ANALYTICS_RANGES, type AnalyticsOverview, type AnalyticsRange } from './types'

const RANGE_LABELS: Record<AnalyticsRange, string> = {
  7: 'Last 7 days',
  30: 'Last 30 days',
  90: 'Last 90 days',
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`
}

export default function AnalyticsPage() {
  const router = useRouter()
  const { status, request } = useAuth()
  const [range, setRange] = useState<AnalyticsRange>(7)
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(
    async (selectedRange: AnalyticsRange) => {
      setLoading(true)
      setError(null)
      try {
        setOverview(await fetchAnalytics(request, selectedRange))
      } catch {
        setError('We could not load analytics.')
      } finally {
        setLoading(false)
      }
    },
    [request],
  )

  useEffect(() => {
    if (status === 'signed-out') {
      router.replace('/login')
      return
    }
    if (status !== 'signed-in') {
      return
    }
    void load(range)
  }, [load, range, router, status])

  if (status === 'loading' || (status === 'signed-in' && loading && overview === null)) {
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

  const weeklyMax = Math.max(1, ...(overview?.weeklyScans.map((bucket) => bucket.count) ?? [0]))

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
            <h1 className="mt-2 text-3xl font-semibold text-base-content">Analytics</h1>
            <p className="mt-1 text-sm text-base-content/70">
              QR scans and Passport views for your company, reported in UTC.
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
              onClick={() => void load(range)}
            >
              Try again
            </button>
          </div>
        ) : null}

        {overview !== null ? (
          <div className="mt-8 space-y-8">
            <section aria-labelledby="scans-today-heading">
              <h2 id="scans-today-heading" className="text-xl font-semibold text-base-content">
                Scans Today
              </h2>
              <div className="card mt-3 border border-base-300 bg-base-100 shadow-sm">
                <div className="card-body p-5">
                  <p className="text-sm text-base-content/70">
                    QR scans accepted since 00:00 UTC today.
                  </p>
                  <p
                    className="mt-2 text-3xl font-semibold text-base-content"
                    data-testid="analytics-scans-today"
                  >
                    {overview.scansToday}
                  </p>
                </div>
              </div>
            </section>

            <section aria-labelledby="weekly-scans-heading">
              <h2 id="weekly-scans-heading" className="text-xl font-semibold text-base-content">
                Weekly Scans
              </h2>
              <div className="card mt-3 border border-base-300 bg-base-100 shadow-sm">
                <div className="card-body p-5">
                  <p className="text-sm text-base-content/70">
                    The last seven UTC days, oldest first. Days with no scans are shown as zero.
                  </p>
                  {/* A table, not colour alone: the same numbers are readable without the bars. */}
                  <table className="table mt-3" data-testid="analytics-weekly-scans">
                    <caption className="sr-only">
                      QR scans per UTC day for the last seven days
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">UTC date</th>
                        <th scope="col">Scans</th>
                        <th scope="col">
                          <span className="sr-only">Relative volume</span>
                          <span aria-hidden="true">Volume</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.weeklyScans.map((bucket) => (
                        <tr key={bucket.dateUtc}>
                          <th scope="row" className="font-normal">
                            {bucket.dateUtc}
                          </th>
                          <td>{bucket.count}</td>
                          <td>
                            <div
                              className="h-3 rounded bg-primary"
                              style={{ width: `${Math.round((bucket.count / weeklyMax) * 100)}%` }}
                              aria-hidden="true"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section aria-labelledby="most-viewed-heading">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="most-viewed-heading" className="text-xl font-semibold text-base-content">
                  Most Viewed Products
                </h2>
                <fieldset
                  className="flex items-center gap-1"
                  aria-label="Ranking range"
                  data-testid="analytics-range"
                >
                  <legend className="sr-only">Ranking range</legend>
                  {ANALYTICS_RANGES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`btn btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary ${
                        value === range ? 'btn-primary' : 'btn-ghost'
                      }`}
                      aria-pressed={value === range}
                      onClick={() => setRange(value)}
                    >
                      {RANGE_LABELS[value]}
                    </button>
                  ))}
                </fieldset>
              </div>
              <div className="card mt-3 border border-base-300 bg-base-100 shadow-sm">
                <div className="card-body p-5">
                  <p className="text-sm text-base-content/70">
                    Ranked by Passport views in the selected UTC range.
                  </p>
                  {overview.mostViewed.length === 0 ? (
                    <p
                      className="mt-3 text-base-content/70"
                      data-testid="analytics-most-viewed-empty"
                    >
                      No Passport views in this range yet.
                    </p>
                  ) : (
                    <table className="table mt-3" data-testid="analytics-most-viewed">
                      <caption className="sr-only">Most viewed published Passports</caption>
                      <thead>
                        <tr>
                          <th scope="col">Product</th>
                          <th scope="col">SKU</th>
                          <th scope="col">Serial</th>
                          <th scope="col">Views</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.mostViewed.map((row) => (
                          <tr key={row.publicUuid}>
                            <th scope="row" className="font-normal">
                              <Link
                                href={`/passport/${row.publicUuid}`}
                                className="link link-primary"
                              >
                                {row.name ?? 'Untitled product'}
                              </Link>
                            </th>
                            <td>{row.sku ?? '—'}</td>
                            <td>{row.serialNumber ?? '—'}</td>
                            <td>{row.views}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </section>

            <section aria-labelledby="latest-scans-heading">
              <h2 id="latest-scans-heading" className="text-xl font-semibold text-base-content">
                Latest Scans
              </h2>
              <div className="card mt-3 border border-base-300 bg-base-100 shadow-sm">
                <div className="card-body p-5">
                  <p className="text-sm text-base-content/70">
                    The most recent QR scans, newest first. The country is mocked for this
                    assessment and is never inferred from the visitor.
                  </p>
                  {overview.latestScans.length === 0 ? (
                    <p
                      className="mt-3 text-base-content/70"
                      data-testid="analytics-latest-scans-empty"
                    >
                      No QR scans recorded yet.
                    </p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="table" data-testid="analytics-latest-scans">
                        <caption className="sr-only">Most recent QR scans</caption>
                        <thead>
                          <tr>
                            <th scope="col">Scanned at (UTC)</th>
                            <th scope="col">Product</th>
                            <th scope="col">Browser</th>
                            <th scope="col">Operating system</th>
                            <th scope="col">Language</th>
                            <th scope="col">Country (mock)</th>
                            {/* Rendered only when the API sent it, which it does for an Admin. */}
                            {overview.latestScans.some((scan) => scan.ipAddress !== undefined) ? (
                              <th scope="col">IP address</th>
                            ) : null}
                          </tr>
                        </thead>
                        <tbody>
                          {overview.latestScans.map((scan) => (
                            <tr key={`${scan.publicUuid}-${scan.occurredAt}`}>
                              <th scope="row" className="font-normal whitespace-nowrap">
                                {formatTimestamp(scan.occurredAt)}
                              </th>
                              <td>{scan.name ?? 'Untitled product'}</td>
                              <td>{scan.browser ?? 'Unknown'}</td>
                              <td>{scan.operatingSystem ?? 'Unknown'}</td>
                              <td>{scan.language ?? 'Unknown'}</td>
                              <td>
                                {scan.country === null ? 'Not captured' : `${scan.country} (mock)`}
                              </td>
                              {scan.ipAddress !== undefined ? (
                                <td>{scan.ipAddress ?? '—'}</td>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  )
}
