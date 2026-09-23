import { randomBytes } from 'node:crypto'
import sharp from 'sharp'

/**
 * Deterministic test file builders.
 *
 * Every fixture is generated in-process: no network access, no committed binaries and
 * no third-party assets. Images are produced by the same library the API uses to
 * normalize them, so a fixture that the pipeline accepts is genuinely decodable.
 */

/** Rejects images beyond this in either dimension, mirrored from the API policy. */
const API_MAX_DIMENSION = 8192
const API_MAX_PIXELS = 40_000_000

export async function pngFixture(width = 64, height = 48): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#2b6cb0' } })
    .png()
    .toBuffer()
}

export async function jpegFixture(width = 64, height = 48): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#c05621' } })
    .jpeg()
    .toBuffer()
}

export async function webpFixture(width = 64, height = 48): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#2f855a' } })
    .webp()
    .toBuffer()
}

/**
 * A JPEG that carries EXIF metadata, used to prove normalization strips it.
 *
 * Returns the bytes plus the metadata that sharp can see in them, so a test can assert
 * the input really had EXIF before asserting the stored copy does not.
 */
export async function jpegWithExifFixture(): Promise<{ bytes: Buffer; hadExif: boolean }> {
  const bytes = await sharp({
    create: { width: 64, height: 48, channels: 3, background: '#553c9a' },
  })
    .withMetadata({ exif: { IFD0: { Copyright: 'fixture-copyright-marker' } } })
    .jpeg()
    .toBuffer()

  const metadata = await sharp(bytes).metadata()
  return { bytes, hadExif: metadata.exif !== undefined }
}

/**
 * A minimal, structurally valid single-page PDF.
 *
 * Carries the header, a cross-reference pointer and an end-of-file marker, which is
 * what the API's bounded structural check requires beyond the magic number.
 */
export function pdfFixture(): Buffer {
  return Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
trailer<</Root 1 0 R>>
startxref
9
%%EOF
`,
    'latin1',
  )
}

/** Only the PDF magic number: `file-type` reports this as a PDF, the structure check must not. */
export function fakePdfFixture(): Buffer {
  return Buffer.from('%PDF-1.7\nnot really a pdf at all', 'latin1')
}

export function svgFixture(): Buffer {
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    'utf8',
  )
}

export function htmlFixture(): Buffer {
  return Buffer.from('<!DOCTYPE html><html><body>hello</body></html>', 'utf8')
}

/** A minimal valid empty ZIP archive. */
export function zipFixture(): Buffer {
  return Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(18)])
}

export function elfFixture(): Buffer {
  return Buffer.concat([
    Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]),
    Buffer.alloc(64),
  ])
}

/** A Windows executable header (MZ). */
export function executableFixture(): Buffer {
  return Buffer.concat([Buffer.from('MZ', 'latin1'), Buffer.alloc(200)])
}

export function truncated(buffer: Buffer, ratio = 0.5): Buffer {
  return buffer.subarray(0, Math.max(1, Math.floor(buffer.length * ratio)))
}

/**
 * An image larger than the 5 MiB image limit.
 *
 * Random pixel data does not compress, so a modest canvas yields a file comfortably
 * over the limit while still being a real, decodable PNG.
 */
export async function oversizedPngFixture(): Promise<Buffer> {
  const width = 1500
  const height = 1500
  const noise = randomBytes(width * height * 3)

  return sharp(noise, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer()
}

/** A PDF-shaped payload larger than the 10 MiB hard cap, rejected while the body is read. */
export function oversizedPdfFixture(): Buffer {
  const padding = Buffer.alloc(11 * 1024 * 1024, 0x20)
  return Buffer.concat([pdfFixture(), padding])
}

/**
 * A PNG whose dimensions exceed the supported maximum.
 *
 * Built by upscaling a tiny image: the pixel limit governs decoding, not encoding, so
 * this produces an oversized canvas without needing the limit lifted.
 */
export async function oversizedDimensionPngFixture(): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: '#111' } })
    .resize(API_MAX_DIMENSION + 1000, 8)
    .png({ compressionLevel: 9 })
    .toBuffer()
}

export const IMAGE_POLICY = {
  maxDimension: API_MAX_DIMENSION,
  maxPixels: API_MAX_PIXELS,
} as const
