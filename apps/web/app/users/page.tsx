'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth-context'
import { BackOfficeNav } from '../back-office-nav'
import { describeApiError, ProductApiError, readApiResponse } from '../products/api'
import { isUserListResponse, isUserSummary, type UserListResponse, type UserSummary } from './types'

/**
 * Administrative user management.
 *
 * The page is Admin-only, and the API refuses an Editor regardless of what the browser
 * renders. Two rules shape the interaction: a role change is observed by the target's very
 * next request, and the last active administrator cannot be removed or disabled — so the
 * destructive actions ask first, and the server's refusal is shown as it is rather than
 * pre-empted in the UI.
 */

type PendingAction = {
  user: UserSummary
  kind: 'role' | 'deactivate'
}

export default function UsersPage() {
  const router = useRouter()
  const { request, status } = useAuth()
  const [users, setUsers] = useState<UserListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'EDITOR'>('EDITOR')
  const [password, setPassword] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const [pending, setPending] = useState<PendingAction | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const response = await request('/users?pageSize=100')
      const payload = await readApiResponse<unknown>(response)
      if (!isUserListResponse(payload)) {
        throw new ProductApiError(502, 'The API returned invalid user data.')
      }
      setUsers(payload)
    } catch (loadError) {
      setError(describeApiError(loadError, 'Unable to load users.'))
    }
  }, [request])

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

  const createUser = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setCreateError(null)
      setNotice(null)
      setIsCreating(true)
      try {
        const response = await request('/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role, password }),
        })
        const payload = await readApiResponse<unknown>(response)
        if (!isUserSummary(payload)) {
          throw new ProductApiError(502, 'The API returned an invalid user.')
        }
        setNotice(
          `Created ${payload.email}. Communicate the initial password out of band; it is not emailed or shown again.`,
        )
        setEmail('')
        setPassword('')
        setRole('EDITOR')
        await load()
      } catch (createFailure) {
        setCreateError(describeApiError(createFailure, 'Unable to create the user.'))
      } finally {
        setIsCreating(false)
      }
    },
    [email, load, password, request, role],
  )

  const applyAction = useCallback(async () => {
    if (pending === null) {
      return
    }
    setIsBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      const body =
        pending.kind === 'role'
          ? { role: pending.user.role === 'ADMIN' ? 'EDITOR' : 'ADMIN' }
          : { active: !pending.user.active }
      const response = await request(`/users/${pending.user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      await readApiResponse<unknown>(response)
      setNotice(
        pending.kind === 'role'
          ? `${pending.user.email} is now ${body.role === 'ADMIN' ? 'an administrator' : 'an editor'}.`
          : `${pending.user.email} is now ${body.active === true ? 'active' : 'disabled and signed out'}.`,
      )
      setPending(null)
      await load()
    } catch (actionFailure) {
      // The last-Admin refusal arrives here, as the server's own controlled conflict.
      setActionError(describeApiError(actionFailure, 'Unable to update the user.'))
    } finally {
      setIsBusy(false)
    }
  }, [load, pending, request])

  if (status === 'loading' || (status === 'signed-in' && users === null && error === null)) {
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
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-base-300 pb-5">
          <div>
            <Link
              href="/"
              className="text-sm font-semibold uppercase tracking-[0.18em] text-primary"
            >
              Notarify
            </Link>
            <h1 className="mt-2 text-3xl font-semibold text-base-content">Users</h1>
            <p className="mt-1 text-sm text-base-content/70">
              Manage who can work in this company and with which role.
            </p>
          </div>
          <BackOfficeNav />
        </header>

        {error !== null ? (
          <div className="mt-6">
            <p className="alert alert-error" role="alert" data-testid="users-load-error">
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

        {notice !== null ? (
          <p className="alert alert-success mt-6" role="status" data-testid="users-notice">
            {notice}
          </p>
        ) : null}
        {actionError !== null ? (
          <p className="alert alert-error mt-6" role="alert" data-testid="users-action-error">
            {actionError}
          </p>
        ) : null}

        <section
          className="card mt-6 border border-base-300 bg-base-100 shadow-sm"
          aria-labelledby="create-user-heading"
        >
          <div className="card-body p-5">
            <h2 id="create-user-heading" className="text-xl font-semibold">
              Create user
            </h2>
            <p className="text-sm text-base-content/70">
              You set the initial password and communicate it out of band. This assessment has no
              invitation email or password-reset flow.
            </p>
            <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3" onSubmit={createUser}>
              <label className="form-control" htmlFor="new-user-email">
                <span className="label-text">Email</span>
                <input
                  id="new-user-email"
                  type="email"
                  className="input input-bordered"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label className="form-control" htmlFor="new-user-role">
                <span className="label-text">Role</span>
                <select
                  id="new-user-role"
                  className="select select-bordered"
                  value={role}
                  onChange={(event) => setRole(event.target.value === 'ADMIN' ? 'ADMIN' : 'EDITOR')}
                >
                  <option value="EDITOR">Editor</option>
                  <option value="ADMIN">Administrator</option>
                </select>
              </label>
              <label className="form-control" htmlFor="new-user-password">
                <span className="label-text">Initial password</span>
                <input
                  id="new-user-password"
                  type="password"
                  className="input input-bordered"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </label>
              <div className="sm:col-span-3">
                {createError !== null ? (
                  <p className="alert alert-error mb-3" role="alert">
                    {createError}
                  </p>
                ) : null}
                <button
                  type="submit"
                  className="btn btn-primary focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  disabled={isCreating}
                  data-testid="user-create-submit"
                >
                  {isCreating ? 'Creating…' : 'Create user'}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section
          className="card mt-6 border border-base-300 bg-base-100 shadow-sm"
          aria-labelledby="user-list-heading"
        >
          <div className="card-body p-5">
            <h2 id="user-list-heading" className="text-xl font-semibold">
              Company users
            </h2>
            {users === null ? null : users.items.length === 0 ? (
              <p className="mt-3 text-base-content/70">No users yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="table" data-testid="users-table">
                  <thead>
                    <tr>
                      <th scope="col">Email</th>
                      <th scope="col">Role</th>
                      <th scope="col">Status</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users?.items.map((user) => (
                      <tr key={user.id} data-testid={`user-row-${user.email}`}>
                        <th scope="row" className="font-normal">
                          {user.email}
                        </th>
                        <td>{user.role === 'ADMIN' ? 'Administrator' : 'Editor'}</td>
                        <td>
                          <span
                            className={`badge ${user.active ? 'badge-success' : 'badge-ghost'}`}
                            data-testid={`user-status-${user.email}`}
                          >
                            {user.active ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="btn btn-xs btn-ghost focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                              onClick={() => {
                                setActionError(null)
                                setNotice(null)
                                setPending({ user, kind: 'role' })
                              }}
                              data-testid={`user-role-${user.email}`}
                            >
                              {user.role === 'ADMIN' ? 'Make editor' : 'Make administrator'}
                            </button>
                            <button
                              type="button"
                              className={`btn btn-xs btn-ghost focus:outline-2 focus:outline-offset-2 focus:outline-primary ${
                                user.active ? 'text-error' : ''
                              }`}
                              onClick={() => {
                                setActionError(null)
                                setNotice(null)
                                setPending({ user, kind: 'deactivate' })
                              }}
                              data-testid={`user-toggle-${user.email}`}
                            >
                              {user.active ? 'Disable' : 'Reactivate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {pending !== null ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-action-heading"
          data-testid="user-action-dialog"
        >
          <div className="card w-full max-w-lg border border-base-300 bg-base-100 shadow-xl">
            <div className="card-body gap-4">
              <h2 id="user-action-heading" className="text-xl font-semibold">
                {pending.kind === 'role'
                  ? pending.user.role === 'ADMIN'
                    ? 'Remove administrator access?'
                    : 'Grant administrator access?'
                  : pending.user.active
                    ? 'Disable this user?'
                    : 'Reactivate this user?'}
              </h2>
              <p className="text-sm text-base-content/70">
                {pending.kind === 'role'
                  ? pending.user.role === 'ADMIN'
                    ? `${pending.user.email} will lose administrator access on their next request.`
                    : `${pending.user.email} will gain administrator access on their next request.`
                  : pending.user.active
                    ? `${pending.user.email} will be signed out immediately and cannot sign in until reactivated.`
                    : `${pending.user.email} will be able to sign in again. Revoked sessions are not restored.`}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  onClick={() => setPending(null)}
                  disabled={isBusy}
                  data-testid="user-action-cancel"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                  onClick={() => void applyAction()}
                  disabled={isBusy}
                  data-testid="user-action-confirm"
                >
                  {isBusy ? 'Working…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
