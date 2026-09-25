import type { HttpResponse } from '../common/http-types.js'
import type { PassportPdfDocument } from './passport-pdf-document.js'

/**
 * The response surface a streamed PDF needs.
 *
 * Express's response is a Node writable stream, but this project types `HttpResponse` as
 * the small surface the other binary routes use. This narrow extension keeps that
 * boundary: only the members this route actually calls are declared.
 */
export type StreamingHttpResponse = HttpResponse & {
  end(): void
  destroy(): void
  on(event: 'close' | 'finish', listener: () => void): unknown
  writableEnded?: boolean
}

/**
 * Streams a PDF document to the client, drawing its content only after the pipe exists.
 *
 * The caller must have completed every preflight — active version, snapshot projection,
 * stored QR and retained images — and set the response headers before calling this.
 * Drawing after the pipe means a large passport streams instead of being queued in memory
 * ahead of the response.
 *
 * Once streaming has started there is no safe way to send a JSON error, so a failure
 * destroys the response rather than finishing it cleanly: a clean end would present a
 * truncated body as a complete download. The error is reported through `onError`, which
 * the caller uses for safe diagnostics; nothing about it reaches the client.
 */
export async function streamPdfResponse(input: {
  response: StreamingHttpResponse
  document: PassportPdfDocument
  draw: () => void
  onError: (error: unknown) => void
}): Promise<void> {
  const { response, document, draw, onError } = input

  await new Promise<void>((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) {
        return
      }
      settled = true
      resolve()
    }
    const abort = (error: unknown): void => {
      onError(error)
      if (response.writableEnded !== true) {
        response.destroy()
      }
      finish()
    }

    document.on('error', abort)
    response.on('close', finish)
    response.on('finish', finish)
    document.pipe(response as unknown as NodeJS.WritableStream)

    try {
      draw()
      document.end()
    } catch (error) {
      abort(error)
    }
  })
}
