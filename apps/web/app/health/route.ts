/**
 * The web health route.
 *
 * A route handler rather than a page: it must answer a Compose health check without
 * authentication, without rendering React and without touching the API, so it reports only
 * that the Next server is serving. Application readiness belongs to the API's own
 * `/health/ready`, which checks the authoritative database.
 */
export const dynamic = 'force-dynamic'

export function GET(): Response {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
}
