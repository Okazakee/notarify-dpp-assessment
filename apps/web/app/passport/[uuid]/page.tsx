import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { NotarifyMark } from '../brand-mark'
import { PassportPresentation } from '../presentation'
import { fetchPublicPassport } from '../public-passport'
import { PassportViewTracker } from '../view-tracker'

type PublicPassportPageProps = {
  params: Promise<{ uuid: string }>
}

/**
 * The anonymous public passport page.
 *
 * It is a Server Component on purpose: the published product name and passport metadata
 * must be present in the returned HTML, not assembled by the browser after hydration. The
 * page reads only the anonymous `GET /passport/:uuid` projection — never the authenticated
 * product endpoints — so what a reviewer sees here is exactly the immutable published
 * version, unaffected by any draft edit that has not been republished.
 *
 * The fetch is `no-store` to preserve the accepted no-cache semantics of the public
 * surface, and every failure collapses to either the shared not-found state or a generic
 * unavailable state that never renders backend JSON.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PublicPassportPageProps): Promise<Metadata> {
  const { uuid } = await params
  const result = await fetchPublicPassport(uuid)

  if (result.kind !== 'ok') {
    return { title: 'Passport — Notarify' }
  }

  const name = result.model.product.name ?? 'Product'
  return {
    title: `${name} — Digital Product Passport`,
    description: 'A Digital Product Passport published with Notarify.',
    // Public passports are addressed by an unguessable UUID; keeping them out of search
    // indexes is deliberate and does not affect anonymous access.
    robots: { index: false, follow: false },
  }
}

function UnavailableState() {
  return (
    <main
      data-testid="passport-unavailable"
      className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center"
    >
      <NotarifyMark className="h-10 w-10 text-primary" />
      <h1 className="text-2xl font-semibold">This passport is temporarily unavailable</h1>
      <p className="text-sm text-base-content/70">
        The published passport could not be read right now. Please try again later. A printed QR
        code stays valid, so the same link will work once the passport is readable again.
      </p>
    </main>
  )
}

export default async function PublicPassportPage({ params }: PublicPassportPageProps) {
  const { uuid } = await params
  const result = await fetchPublicPassport(uuid)

  if (result.kind === 'not-found') {
    notFound()
  }

  if (result.kind === 'unavailable') {
    return <UnavailableState />
  }

  return (
    <div className="min-h-screen bg-base-200">
      {/* Counts one visible navigation. It renders nothing and never gates the page. */}
      {/* The public projection always carries both; the shared model allows null for */}
      {/* editor placeholders, so the tracker is skipped rather than invented. */}
      {result.model.passport.publicUuid !== null && result.model.passport.version !== null ? (
        <PassportViewTracker
          publicUuid={result.model.passport.publicUuid}
          version={result.model.passport.version}
        />
      ) : null}
      <main className="px-4 py-8 sm:px-6 sm:py-12">
        <PassportPresentation model={result.model} />
      </main>
      <footer className="mx-auto w-full max-w-5xl px-4 pb-10 text-xs text-base-content/60 sm:px-6">
        Digital Product Passport published with Notarify. Prototype assessment build: the data shown
        is published by the product operator and is not a regulatory registration.
      </footer>
    </div>
  )
}
