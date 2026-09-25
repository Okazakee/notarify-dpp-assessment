import { EventEmitter } from 'node:events'
import type { PassportPdfDocument } from '../src/public-passport/passport-pdf-document.js'
import {
  type StreamingHttpResponse,
  streamPdfResponse,
} from '../src/public-passport/passport-pdf-stream.js'

/**
 * Focused unit coverage for the PDF streaming helper.
 *
 * The integration suite proves the happy path end to end; these tests pin the failure
 * contract that is hard to trigger through HTTP: once streaming has begun, a renderer or
 * draw failure must abort the response instead of finishing a truncated body that a
 * client would treat as a complete download.
 *
 * The document and response are minimal structural stubs. The real objects are a PDFKit
 * stream and an Express response; only the members the helper calls are implemented.
 */

class FakeDocument extends EventEmitter {
  pipedTo: unknown = null
  ended = false

  pipe(destination: unknown): this {
    this.pipedTo = destination
    return this
  }

  end(): void {
    this.ended = true
  }
}

class FakeResponse {
  writableEnded = false
  ended = false
  destroyed = false
  private readonly events = new EventEmitter()

  setHeader(): void {}
  status(): this {
    return this
  }
  json(): void {}
  cookie(): void {}
  clearCookie(): void {}
  on(event: string, listener: () => void): this {
    this.events.on(event, listener)
    return this
  }
  emit(event: string): void {
    this.events.emit(event)
  }
  end(): void {
    this.ended = true
    this.writableEnded = true
  }
  destroy(): void {
    this.destroyed = true
  }
}

function createStream(): {
  document: FakeDocument
  response: FakeResponse
  errors: unknown[]
  run: () => Promise<void>
} {
  const document = new FakeDocument()
  const response = new FakeResponse()
  const errors: unknown[] = []
  return {
    document,
    response,
    errors,
    run: () =>
      streamPdfResponse({
        response: response as unknown as StreamingHttpResponse,
        document: document as unknown as PassportPdfDocument,
        draw: () => {},
        onError: (error) => errors.push(error),
      }),
  }
}

describe('Passport PDF streaming', () => {
  it('aborts the response when the document errors after streaming starts', async () => {
    const { document, response, errors, run } = createStream()
    const streamed = run()

    document.emit('error', new Error('renderer failed'))
    await streamed

    expect(errors).toHaveLength(1)
    expect(response.destroyed).toBe(true)
    // A clean end would present the truncated body as a complete download.
    expect(response.ended).toBe(false)
  })

  it('aborts the response when drawing throws synchronously', async () => {
    const document = new FakeDocument()
    const response = new FakeResponse()
    const errors: unknown[] = []

    await streamPdfResponse({
      response: response as unknown as StreamingHttpResponse,
      document: document as unknown as PassportPdfDocument,
      draw: () => {
        throw new Error('draw failed')
      },
      onError: (error) => errors.push(error),
    })

    expect(errors).toHaveLength(1)
    expect(response.destroyed).toBe(true)
    expect(response.ended).toBe(false)
    expect(document.ended).toBe(false)
  })

  it('pipes before drawing and ends the document on success', async () => {
    const document = new FakeDocument()
    const response = new FakeResponse()
    const errors: unknown[] = []
    let pipedBeforeDraw = false

    const streamed = streamPdfResponse({
      response: response as unknown as StreamingHttpResponse,
      document: document as unknown as PassportPdfDocument,
      draw: () => {
        // The document is already attached to the response when content is drawn, so a
        // large passport streams instead of being queued ahead of the response.
        pipedBeforeDraw = document.pipedTo === response
      },
      onError: (error) => errors.push(error),
    })

    response.emit('finish')
    await streamed

    expect(errors).toHaveLength(0)
    expect(response.destroyed).toBe(false)
    expect(document.ended).toBe(true)
    expect(pipedBeforeDraw).toBe(true)
  })
})
