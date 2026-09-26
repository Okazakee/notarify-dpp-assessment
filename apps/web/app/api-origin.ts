/**
 * The API origin the web app resolves API-relative paths against.
 *
 * This is the **browser-visible** origin: the client (`auth-context.tsx`, the view tracker)
 * and every rendered URL use it, so it must be reachable from a reviewer's browser.
 *
 * `NEXT_PUBLIC_*` values are resolved when the bundle is built, so this origin is a
 * build-time concern for the web app — exactly as the rewrite destination already was.
 * This module is server-safe: it must not be imported into a `'use client'` module
 * solely to re-export it, and it must not import browser APIs.
 */
export const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
)

/**
 * The API origin Next itself uses when it calls the API from the server.
 *
 * A container topology has two different answers to "where is the API": the browser
 * reaches it at `NEXT_PUBLIC_API_URL`, while the web server reaches it at an internal
 * address such as `http://api:3000`. Using the browser origin for a server-side fetch
 * inside a container would resolve to the web container itself.
 *
 * `INTERNAL_API_URL` is deliberately **not** a `NEXT_PUBLIC_*` variable, so it never
 * enters the browser bundle. It is only ever used for requests Next makes itself, and it
 * must never reach a rendered link or a public asset URL, because `http://api:3000` is not
 * resolvable from a reviewer's browser.
 *
 * Unset means "same as the browser origin", which keeps native development simple.
 */
export const INTERNAL_API_ORIGIN = (
  typeof process.env.INTERNAL_API_URL === 'string' && process.env.INTERNAL_API_URL.length > 0
    ? process.env.INTERNAL_API_URL
    : API_ORIGIN
).replace(/\/$/, '')

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

/**
 * The server-side counterpart of `apiUrl`, for requests the Next server makes itself.
 *
 * Only use this for a fetch whose result is rendered data. A URL that ends up in the HTML
 * must be built with `apiUrl` instead.
 */
export function serverApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path
  }
  return path.startsWith('/') ? `${INTERNAL_API_ORIGIN}${path}` : `${INTERNAL_API_ORIGIN}/${path}`
}
