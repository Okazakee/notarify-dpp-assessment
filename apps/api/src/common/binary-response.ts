import type { HttpResponse } from './http-types.js'

/**
 * Shared binary-response helpers.
 *
 * Both the authenticated asset route and the anonymous published-asset route stream
 * bytes, and both must build a header set that a caller cannot influence. Keeping the
 * logic here means a new binary route cannot accidentally ship a weaker variant.
 */

/**
 * The response surface a binary route needs.
 *
 * `end` is used directly rather than returning the buffer: Nest's reply logic treats an
 * object body as JSON, which would serialize the buffer as `{"type":"Buffer",...}`
 * instead of streaming the bytes.
 */
export type BinaryHttpResponse = HttpResponse & {
  end(body: Buffer): void
}

/**
 * Builds a `Content-Disposition` value that cannot break out of the header.
 *
 * The filename is only ever display metadata, but it originates from an uploaded name,
 * so it is reduced to a printable-ASCII fallback and a percent-encoded `filename*`
 * rather than being interpolated raw.
 */
export function contentDisposition(
  originalName: string,
  disposition: 'inline' | 'attachment',
): string {
  const asciiFallback = originalName.replace(/[^\u0020-\u007e]/g, '_').replace(/["\\]/g, '_')
  const encoded = encodeURIComponent(originalName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )

  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`
}

/**
 * Writes a binary body with a server-controlled content type.
 *
 * `contentType` always comes from what the server detected and stored, never from the
 * request, a filename extension or a query parameter. `nosniff` stops a browser from
 * reinterpreting the bytes as something more dangerous.
 */
export function writeBinaryResponse(
  response: BinaryHttpResponse,
  body: Buffer,
  options: {
    contentType: string
    originalName: string
    disposition: 'inline' | 'attachment'
    cacheControl?: string
  },
): void {
  response.setHeader('Content-Type', options.contentType)
  response.setHeader('Content-Length', String(body.length))
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Cache-Control', options.cacheControl ?? 'no-store')
  response.setHeader(
    'Content-Disposition',
    contentDisposition(options.originalName, options.disposition),
  )
  response.end(body)
}
