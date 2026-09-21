'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from './auth-context'
import { LogoutButton } from './logout-button'

export default function HomePage() {
  const router = useRouter()
  const { status, user } = useAuth()

  useEffect(() => {
    if (status === 'signed-out') {
      router.replace('/login')
    }
  }, [router, status])

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

  return (
    <main className="min-h-screen bg-base-200 p-6 sm:p-10">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between border-b border-base-300 pb-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Notarify
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-base-content">
              Authenticated workspace
            </h1>
          </div>
          <LogoutButton />
        </header>

        <section className="card mt-8 border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body">
            <p className="text-sm text-base-content/70">Signed in as</p>
            <p className="text-xl font-medium text-base-content">{user.email}</p>
            <p className="text-sm text-base-content/70">Role: {user.role}</p>
            <div className="card-actions mt-4">
              <Link
                href="/dashboard"
                className="btn btn-primary focus:outline-2 focus:outline-offset-2 focus:outline-primary"
              >
                View account status
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
