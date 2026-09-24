import { NotarifyMark } from '../brand-mark'

/**
 * The single not-found state for the public passport route.
 *
 * A malformed UUID, an unknown UUID, an unpublished product, a withdrawn passport and a
 * soft-deleted product are all indistinguishable here, which is the point: the page must
 * not become a way to learn whether a passport exists.
 */
export default function PublicPassportNotFound() {
  return (
    <main
      data-testid="passport-not-found"
      className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center"
    >
      <NotarifyMark className="h-10 w-10 text-primary" />
      <h1 className="text-2xl font-semibold">Passport not found</h1>
      <p className="text-sm text-base-content/70">
        This passport is not available at this address. If you scanned a QR code, contact the
        operator who published it.
      </p>
    </main>
  )
}
