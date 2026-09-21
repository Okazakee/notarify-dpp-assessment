'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { type AuthUser, useAuth } from '../auth-context'
import { LogoutButton } from '../logout-button'

export default function DashboardPage() {
  const router = useRouter()
  const { status, getMe } = useAuth()
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'signed-out') {
      router.replace('/login')
      return
    }
    if (status !== 'signed-in') {
      return
    }

    let active = true
    void getMe()
      .then((authenticatedUser) => {
        if (active) {
          setCurrentUser(authenticatedUser)
        }
      })
      .catch(() => {
        if (active) {
          setError('We could not load your account details.')
        }
      })

    return () => {
      active = false
    }
  }, [getMe, router, status])

  if (status === 'loading' || (status === 'signed-in' && currentUser === null && error === null)) {
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
    <main className="min-h-screen bg-base-200 p-6 sm:p-10">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between border-b border-base-300 pb-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Notarify
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-base-content">Account status</h1>
          </div>
          <LogoutButton />
        </header>

        {error !== null ? (
          <p className="alert alert-error mt-8" role="alert">
            {error}
          </p>
        ) : currentUser !== null ? (
          <section className="card mt-8 border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body gap-5">
              <div>
                <p className="text-sm text-base-content/70">Signed-in email</p>
                <p className="mt-1 text-xl font-medium text-base-content">{currentUser.email}</p>
              </div>
              <div>
                <p className="text-sm text-base-content/70">Role</p>
                <p className="mt-1 text-lg font-medium text-base-content">{currentUser.role}</p>
              </div>
              <div>
                <p className="text-sm text-base-content/70">Company</p>
                <p className="mt-1 text-lg font-medium text-base-content">
                  {currentUser.companyId ?? 'Unavailable'}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <Link
          href="/"
          className="btn btn-ghost mt-6 focus:outline-2 focus:outline-offset-2 focus:outline-primary"
        >
          Back to workspace
        </Link>
      </div>
    </main>
  )
}
