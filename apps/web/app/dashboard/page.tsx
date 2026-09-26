'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { fetchDashboard } from '../analytics/api'
import type { DashboardSummary } from '../analytics/types'
import { type AuthUser, useAuth } from '../auth-context'
import { BackOfficeNav } from '../back-office-nav'

const COUNTERS = [
  { key: 'totalProducts', label: 'Total Products', testId: 'dashboard-total-products' },
  {
    key: 'publishedPassports',
    label: 'Published Passports',
    testId: 'dashboard-published-passports',
  },
  { key: 'generatedQrCodes', label: 'Generated QR Codes', testId: 'dashboard-generated-qr-codes' },
  {
    key: 'totalPassportViews',
    label: 'Total Passport Views',
    testId: 'dashboard-total-passport-views',
  },
] as const

export default function DashboardPage() {
  const router = useRouter()
  const { status, request, getMe } = useAuth()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [nextSummary, authenticatedUser] = await Promise.all([fetchDashboard(request), getMe()])
      setSummary(nextSummary)
      setCurrentUser(authenticatedUser)
    } catch {
      setError('We could not load the dashboard.')
    }
  }, [getMe, request])

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

  if (status === 'loading' || (status === 'signed-in' && summary === null && error === null)) {
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
            <h1 className="mt-2 text-3xl font-semibold text-base-content">Dashboard</h1>
            <p className="mt-1 text-sm text-base-content/70">
              Publication and engagement for your company.
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

        {summary !== null ? (
          <section aria-labelledby="dashboard-counters" className="mt-8">
            <h2 id="dashboard-counters" className="sr-only">
              Dashboard counters
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {COUNTERS.map((counter) => (
                <div
                  key={counter.key}
                  className="card border border-base-300 bg-base-100 shadow-sm"
                >
                  <div className="card-body p-5">
                    <p className="text-sm font-medium text-base-content/70">{counter.label}</p>
                    <p
                      className="mt-2 text-3xl font-semibold text-base-content"
                      data-testid={counter.testId}
                    >
                      {summary[counter.key]}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-base-content/70">
              Counters describe currently active publications. A product that has never been
              published contributes to Total Products only, and a withdrawn Passport leaves the
              published and view totals.
            </p>
          </section>
        ) : null}

        {currentUser !== null ? (
          <section
            className="card mt-8 border border-base-300 bg-base-100 shadow-sm"
            aria-labelledby="account-heading"
          >
            <div className="card-body gap-4">
              <h2 id="account-heading" className="text-lg font-semibold text-base-content">
                Account
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-base-content/70">Signed-in email</p>
                  <p className="mt-1 font-medium text-base-content">{currentUser.email}</p>
                </div>
                <div>
                  <p className="text-sm text-base-content/70">Role</p>
                  <p className="mt-1 font-medium text-base-content">{currentUser.role}</p>
                </div>
                <div>
                  <p className="text-sm text-base-content/70">Company</p>
                  <p className="mt-1 font-medium text-base-content">
                    {currentUser.companyId ?? 'Unavailable'}
                  </p>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  )
}
