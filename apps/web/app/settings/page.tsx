'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ChangeEvent, useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth-context'
import { BackOfficeNav } from '../back-office-nav'
import { useAssetObjectUrls } from '../passport/use-asset-object-urls'
import { describeApiError, ProductApiError, readApiResponse, uploadAsset } from '../products/api'

/**
 * Company settings and recent audit activity.
 *
 * The page is Admin-only, and it is deliberately honest about two things a reader could
 * otherwise assume wrongly:
 *
 * - the public Passport currently renders the application's fixed brand mark, so a company
 *   logo here is workspace administration rather than published Passport branding;
 * - a display-name change affects future publications. An already-published version keeps
 *   the name it was published with, because snapshots are immutable.
 */

type CompanySettings = {
  displayName: string
  logoAssetId: string | null
  updatedAt: string
}

type AuditLogEntry = {
  id: string
  occurredAt: string
  action: string
  entityType: string
  entityId: string
  requestId: string | null
  actor: { id: string; email: string; role: string } | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSettings(value: unknown): value is CompanySettings {
  return (
    isRecord(value) &&
    typeof value.displayName === 'string' &&
    (value.logoAssetId === null || typeof value.logoAssetId === 'string') &&
    typeof value.updatedAt === 'string'
  )
}

function isAuditEntry(value: unknown): value is AuditLogEntry {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.occurredAt === 'string' &&
    typeof value.action === 'string' &&
    typeof value.entityType === 'string' &&
    typeof value.entityId === 'string' &&
    (value.requestId === null || typeof value.requestId === 'string')
  )
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : `${date.toISOString().replace('T', ' ').slice(0, 19)} UTC`
}

export default function SettingsPage() {
  const router = useRouter()
  const { request, status } = useAuth()
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  const logoUrls = useAssetObjectUrls(request, settings?.logoAssetId ? [settings.logoAssetId] : [])

  const load = useCallback(async () => {
    setError(null)
    try {
      const settingsResponse = await request('/settings')
      const settingsPayload = await readApiResponse<unknown>(settingsResponse)
      if (!isSettings(settingsPayload)) {
        throw new ProductApiError(502, 'The API returned invalid settings data.')
      }
      setSettings(settingsPayload)
      setDisplayName(settingsPayload.displayName)

      const auditResponse = await request('/audit-logs?pageSize=10')
      const auditPayload = await readApiResponse<unknown>(auditResponse)
      if (!isRecord(auditPayload) || !Array.isArray(auditPayload.items)) {
        throw new ProductApiError(502, 'The API returned invalid audit data.')
      }
      setAuditEntries(auditPayload.items.filter(isAuditEntry))
    } catch (loadError) {
      setError(describeApiError(loadError, 'Unable to load settings.'))
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

  const save = useCallback(
    async (payload: { displayName?: string; logoAssetId?: string | null }) => {
      setIsSaving(true)
      setSaveError(null)
      setNotice(null)
      try {
        const response = await request('/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const updated = await readApiResponse<unknown>(response)
        if (!isSettings(updated)) {
          throw new ProductApiError(502, 'The API returned invalid settings data.')
        }
        setSettings(updated)
        setDisplayName(updated.displayName)
        setNotice(
          'Settings saved. Already-published Passports keep the branding they were published with.',
        )
        // The audit list reflects the change immediately.
        const auditResponse = await request('/audit-logs?pageSize=10')
        const auditPayload = await readApiResponse<unknown>(auditResponse)
        if (isRecord(auditPayload) && Array.isArray(auditPayload.items)) {
          setAuditEntries(auditPayload.items.filter(isAuditEntry))
        }
      } catch (saveFailure) {
        setSaveError(describeApiError(saveFailure, 'Unable to save settings.'))
      } finally {
        setIsSaving(false)
      }
    },
    [request],
  )

  const onLogoSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file === undefined) {
        return
      }
      setIsUploading(true)
      setSaveError(null)
      try {
        const asset = await uploadAsset(request, file)
        await save({ logoAssetId: asset.id })
      } catch (uploadFailure) {
        setSaveError(describeApiError(uploadFailure, 'Unable to upload the logo.'))
      } finally {
        setIsUploading(false)
      }
    },
    [request, save],
  )

  if (status === 'loading' || (status === 'signed-in' && settings === null && error === null)) {
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
            <h1 className="mt-2 text-3xl font-semibold text-base-content">Settings</h1>
            <p className="mt-1 text-sm text-base-content/70">
              Company identity for this workspace.
            </p>
          </div>
          <BackOfficeNav />
        </header>

        {error !== null ? (
          <div className="mt-6">
            <p className="alert alert-error" role="alert" data-testid="settings-load-error">
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
          <p className="alert alert-success mt-6" role="status" data-testid="settings-notice">
            {notice}
          </p>
        ) : null}
        {saveError !== null ? (
          <p className="alert alert-error mt-6" role="alert" data-testid="settings-error">
            {saveError}
          </p>
        ) : null}

        <section
          className="card mt-6 border border-base-300 bg-base-100 shadow-sm"
          aria-labelledby="identity-heading"
        >
          <div className="card-body p-5">
            <h2 id="identity-heading" className="text-xl font-semibold">
              Company identity
            </h2>
            <p className="text-sm text-base-content/70">
              The display name is copied into a Passport when a version is published, so changing it
              here affects future publications. A published version keeps the name it was published
              with until an explicit republish.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="form-control" htmlFor="company-display-name">
                <span className="label-text">Display name</span>
                <input
                  id="company-display-name"
                  className="input input-bordered"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={160}
                />
              </label>
              <div>
                <p className="label-text">Company logo</p>
                <div className="mt-2 flex items-center gap-4">
                  {settings?.logoAssetId !== null &&
                  settings?.logoAssetId !== undefined &&
                  logoUrls[settings.logoAssetId] ? (
                    // biome-ignore lint/performance/noImgElement: the logo bytes are a private blob: object URL, which the Next image optimiser cannot fetch or optimise.
                    <img
                      src={logoUrls[settings.logoAssetId]}
                      alt="Company logo"
                      className="h-16 w-16 rounded border border-base-300 object-contain"
                      data-testid="settings-logo"
                    />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-base-300 text-xs text-base-content/50">
                      None
                    </span>
                  )}
                  <div className="flex flex-col gap-2">
                    <label
                      className="btn btn-sm btn-outline focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                      htmlFor="company-logo-upload"
                    >
                      {isUploading ? 'Uploading…' : 'Upload logo'}
                      <input
                        id="company-logo-upload"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(event) => void onLogoSelected(event)}
                        disabled={isUploading}
                        data-testid="settings-logo-upload"
                      />
                    </label>
                    {settings?.logoAssetId !== null && settings?.logoAssetId !== undefined ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost text-error focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                        onClick={() => void save({ logoAssetId: null })}
                        disabled={isSaving}
                        data-testid="settings-logo-clear"
                      >
                        Clear logo
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="mt-2 text-xs text-base-content/60">
                  The public Passport page uses Notarify's own brand mark, so this logo is workspace
                  administration rather than published Passport branding.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <button
                type="button"
                className="btn btn-primary focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                onClick={() => void save({ displayName })}
                disabled={isSaving}
                data-testid="settings-save"
              >
                {isSaving ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </div>
        </section>

        <section
          className="card mt-6 border border-base-300 bg-base-100 shadow-sm"
          aria-labelledby="audit-heading"
        >
          <div className="card-body p-5">
            <h2 id="audit-heading" className="text-xl font-semibold">
              Recent Audit Activity
            </h2>
            <p className="text-sm text-base-content/70">
              The most recent recorded administrative changes in this company, newest first.
            </p>
            {auditEntries.length === 0 ? (
              <p className="mt-3 text-base-content/70" data-testid="audit-empty">
                No audit activity recorded yet.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="table" data-testid="audit-table">
                  <thead>
                    <tr>
                      <th scope="col">When (UTC)</th>
                      <th scope="col">Action</th>
                      <th scope="col">Entity</th>
                      <th scope="col">Actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditEntries.map((entry) => (
                      <tr key={entry.id}>
                        <th scope="row" className="font-normal whitespace-nowrap">
                          {formatTimestamp(entry.occurredAt)}
                        </th>
                        <td>{entry.action}</td>
                        <td className="text-xs text-base-content/70">
                          {entry.entityType} · {entry.entityId.slice(0, 8)}…
                        </td>
                        <td>{entry.actor?.email ?? 'System'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
