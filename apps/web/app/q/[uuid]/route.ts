import { serverApiUrl } from '../../api-origin'

export const dynamic = 'force-dynamic'

/**
 * The QR bridge.
 *
 * A printed QR encodes `{PUBLIC_APP_ORIGIN}/q/{uuid}`, which is this web origin, while QR
 * resolution belongs to the API: it is the single place where a scan is recorded and where
 * the redirect target is built from validated configuration. This handler forwards exactly
 * one request to the API's stable resolver and returns its redirect unchanged.
 *
 * It is a route handler rather than a `next.config.ts` rewrite on purpose. Next resolves
 * `rewrites()` during the build and bakes the destination into the routes manifest, which
 * pinned the container-internal API origin at image-build time and made the bridge dial
 * `localhost:3000` from inside the web container. Reading the origin per request keeps one
 * bridge correct in both topologies: native development falls back to the browser origin,
 * and Compose supplies `INTERNAL_API_URL=http://api:3000`.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ uuid: string }> },
): Promise<Response> {
  const { uuid } = await context.params

  let response: Response
  try {
    response = await fetch(serverApiUrl(`/q/${encodeURIComponent(uuid)}`), { redirect: 'manual' })
  } catch {
    // The API is unreachable. A scanner gets an error rather than a misleading redirect,
    // and the failure stays a bridge failure rather than an application one.
    return new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }

  const location = response.headers.get('location')
  if (response.status !== 302 || location === null) {
    // Anything other than the resolver's redirect (a malformed, unknown, withdrawn or
    // soft-deleted passport) is passed through as its own status, so the anonymous surface
    // keeps whatever contract the API defined.
    return new Response(null, { status: response.status, headers: { 'Cache-Control': 'no-store' } })
  }

  return new Response(null, { status: 302, headers: { location, 'Cache-Control': 'no-store' } })
}
