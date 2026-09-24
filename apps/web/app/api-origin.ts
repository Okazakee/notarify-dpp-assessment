/**
 * The API origin the web app resolves API-relative paths against.
 *
 * This is deliberately the same `NEXT_PUBLIC_API_URL` the browser client
 * (`auth-context.tsx`), the `/q/:uuid` rewrite (`next.config.ts`) and the
 * server-rendered public passport page use, so the app has one API origin rather than
 * several that can drift apart.
 *
 * `NEXT_PUBLIC_*` values are resolved when the bundle is built, so the API origin is a
 * build-time concern for the web app — exactly as the rewrite destination already was.
 * This module is server-safe: it must not be imported into a `'use client'` module
 * solely to re-export it, and it must not import browser APIs.
 */
export const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
)

/**
 * Turns a path from an API response contract into an absolute URL.
 *
 * An already-absolute URL is passed through unchanged, so a contract that later starts
 * returning absolute URLs cannot produce a doubled origin here.
 */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path
  }
  return path.startsWith('/') ? `${API_ORIGIN}${path}` : `${API_ORIGIN}/${path}`
}
