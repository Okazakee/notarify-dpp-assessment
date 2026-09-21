'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useState } from 'react'
import { useAuth } from '../auth-context'

export default function LoginPage() {
  const router = useRouter()
  const { status, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (status === 'signed-in') {
      router.replace('/')
    }
  }, [router, status])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await login(email.trim(), password)
      router.replace('/')
    } catch {
      setError('We could not sign you in. Check your details and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (status === 'loading' || status === 'signed-in') {
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
    <main className="flex min-h-screen items-center justify-center bg-base-200 p-6">
      <section className="card w-full max-w-md border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-6 p-8">
          <header>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Notarify
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-base-content">Sign in</h1>
            <p className="mt-2 text-sm text-base-content/70">
              Access your authenticated workspace.
            </p>
          </header>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="form-control">
              <label className="label" htmlFor="email">
                <span className="label-text font-medium">Email</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
              />
            </div>

            <div className="form-control">
              <label className="label" htmlFor="password">
                <span className="label-text font-medium">Password</span>
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="input input-bordered w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
              />
            </div>

            {error !== null && (
              <p className="alert alert-error text-sm" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full focus:outline-2 focus:outline-offset-2 focus:outline-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="loading loading-spinner loading-sm" aria-hidden="true" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
