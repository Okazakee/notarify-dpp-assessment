import { HttpStatus } from '@nestjs/common'
import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'
import { ApiException } from '../common/api-exception.js'

/**
 * Bounded content validation and normalization for uploaded assets.
 *
 * Nothing here trusts the client: the filename, the declared MIME type and the
 * extension are all ignored. The stored `detectedMime` comes from the bytes, and
 * images are decoded and re-encoded before anything is persisted.
 *
 * This module is deliberately free of Nest DI and Prisma so the pipeline can be
 * reasoned about and tested on its own.
 */

/** Assessment limits, locked for this milestone. */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const PDF_MAX_BYTES = 10 * 1024 * 1024

/**
 * The hard cap enforced while the multipart body is being read. It is the largest
 * per-type limit, so no request can buffer more than this; the tighter per-type
 * limit is applied once the content has been identified.
 */
export const UPLOAD_MAX_BYTES = PDF_MAX_BYTES

/** Upper bounds on decoded image dimensions, to bound decode cost and memory. */
export const MAX_IMAGE_DIMENSION = 8192
export const MAX_IMAGE_PIXELS = 40_000_000

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const PDF_MIME_TYPE = 'application/pdf'

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number]
export type AssetKind = 'IMAGE' | 'PDF'

export type DetectedUpload =
  | { kind: 'IMAGE'; mime: ImageMimeType }
  | { kind: 'PDF'; mime: typeof PDF_MIME_TYPE }

const MAX_ORIGINAL_NAME_LENGTH = 255
const PDF_HEADER = '%PDF-'
const PDF_TAIL_WINDOW = 4096

function rejected(status: HttpStatus, code: string, message: string): ApiException {
  return new ApiException(status, code, message)
}

function unsupportedFileType(): ApiException {
  return rejected(
    HttpStatus.BAD_REQUEST,
    'UNSUPPORTED_FILE_TYPE',
    'Unsupported file type. Allowed types are JPEG, PNG, WebP and PDF.',
  )
}

export { unsupportedFileType }

function malformed(message: string): ApiException {
  return rejected(HttpStatus.BAD_REQUEST, 'INVALID_FILE_CONTENT', message)
}

export function fileTooLarge(maxBytes: number): ApiException {
  return rejected(
    HttpStatus.PAYLOAD_TOO_LARGE,
    'FILE_TOO_LARGE',
    `The uploaded file exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MiB limit for its type.`,
  )
}

export function assetNotFound(): ApiException {
  return rejected(HttpStatus.NOT_FOUND, 'ASSET_NOT_FOUND', 'Asset not found.')
}

/**
 * Reduces a client-supplied filename to display metadata only.
 *
 * The result is never used to build a path, and no filesystem is involved, so the
 * goal is a bounded, control-character-free label rather than a security boundary.
 */
export function sanitizeOriginalName(raw: unknown): string {
  if (typeof raw !== 'string') {
    return 'upload'
  }

  // `\p{Cc}` matches the control characters a filename must not carry. Written as a
  // Unicode property escape rather than an explicit range so the intent is readable.
  const withoutControlCharacters = raw.replace(/\p{Cc}/gu, '')
  const withoutSeparators = withoutControlCharacters.replace(/[\\/]/g, '_')
  const trimmed = withoutSeparators.trim().slice(0, MAX_ORIGINAL_NAME_LENGTH)

  return trimmed.length > 0 ? trimmed : 'upload'
}

/**
 * Rejects PDFs whose bytes only look like a PDF.
 *
 * `file-type` matches the `%PDF-` magic number and nothing else, so a file whose
 * entire content is the string `%PDF-1.7` is reported as `application/pdf`. A PDF
 * additionally has to carry a cross-reference pointer and an end-of-file marker.
 * This is a bounded structural check for one format, not a signature framework.
 */
function assertPdfStructure(buffer: Buffer): void {
  if (buffer.length < PDF_HEADER.length) {
    throw malformed('The uploaded file is not a valid PDF.')
  }

  if (buffer.subarray(0, PDF_HEADER.length).toString('latin1') !== PDF_HEADER) {
    throw malformed('The uploaded file is not a valid PDF.')
  }

  const window = Math.min(buffer.length, PDF_TAIL_WINDOW)
  const tail = buffer.subarray(buffer.length - window).toString('latin1')
  if (!tail.includes('startxref') || !tail.includes('%%EOF')) {
    throw malformed('The uploaded file is not a valid PDF.')
  }
}

/**
 * Identifies uploaded content from its bytes and enforces the per-type byte limit.
 *
 * Returns `null` for anything outside the explicit allowlist. Content whose type
 * cannot be determined from its signature is rejected rather than guessed at, which
 * is also what keeps SVG and HTML out: neither is a binary format, so neither is
 * detected, and neither can reach storage.
 */
export async function detectUpload(buffer: Buffer): Promise<DetectedUpload | null> {
  // An empty buffer is not detectable, so it falls through to the unsupported path,
  // which is the same outcome the caller already produces for a missing file.
  const detected = await fileTypeFromBuffer(buffer)
  if (detected === undefined) {
    return null
  }

  if (detected.mime === PDF_MIME_TYPE) {
    if (buffer.length > PDF_MAX_BYTES) {
      throw fileTooLarge(PDF_MAX_BYTES)
    }
    assertPdfStructure(buffer)
    return { kind: 'PDF', mime: PDF_MIME_TYPE }
  }

  const imageMime = IMAGE_MIME_TYPES.find((candidate) => candidate === detected.mime)
  if (imageMime === undefined) {
    return null
  }

  if (buffer.length > IMAGE_MAX_BYTES) {
    throw fileTooLarge(IMAGE_MAX_BYTES)
  }

  return { kind: 'IMAGE', mime: imageMime }
}

/**
 * Decodes an uploaded image and re-encodes it in its own format.
 *
 * Re-encoding is the point: it proves the bytes are a decodable image, bounds the
 * decode through `limitInputPixels`, bakes any EXIF orientation into the pixels and
 * drops all metadata, because sharp only carries metadata across when
 * `withMetadata()` is requested. The output keeps the input's format family so a
 * PNG stays a PNG and transparency survives.
 */
export async function normalizeImage(buffer: Buffer, mime: ImageMimeType): Promise<Buffer> {
  let width: number
  let height: number

  try {
    const metadata = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata()
    width = metadata.width ?? 0
    height = metadata.height ?? 0
  } catch {
    throw malformed('The uploaded image could not be decoded.')
  }

  if (width < 1 || height < 1) {
    throw malformed('The uploaded image could not be decoded.')
  }

  if (
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw rejected(
      HttpStatus.BAD_REQUEST,
      'IMAGE_DIMENSIONS_TOO_LARGE',
      `Image dimensions exceed the supported maximum of ${MAX_IMAGE_DIMENSION}x${MAX_IMAGE_DIMENSION}.`,
    )
  }

  try {
    const pipeline = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS }).rotate()

    switch (mime) {
      case 'image/jpeg':
        return await pipeline.jpeg({ quality: 90 }).toBuffer()
      case 'image/png':
        return await pipeline.png().toBuffer()
      case 'image/webp':
        return await pipeline.webp({ quality: 90 }).toBuffer()
    }
  } catch {
    throw malformed('The uploaded image could not be decoded.')
  }
}

/**
 * Classifies a stored MIME type into the asset family that may reference it.
 *
 * Products use this to keep families apart: a PDF must never become a product
 * image, and an image must never become a document or certification PDF.
 */
export function assetKindForMime(mime: string): AssetKind | null {
  if (mime === PDF_MIME_TYPE) {
    return 'PDF'
  }

  return IMAGE_MIME_TYPES.some((candidate) => candidate === mime) ? 'IMAGE' : null
}

/**
 * Confirms that stored bytes still identify as the MIME type they are labelled with.
 *
 * Applied to normalized output so the `Content-Type` served on retrieval always
 * matches the bytes that were actually persisted.
 */
export async function assertStoredMime(buffer: Buffer, expected: string): Promise<void> {
  const detected = await fileTypeFromBuffer(buffer)
  if (detected === undefined || detected.mime !== expected) {
    throw malformed('The uploaded file could not be normalized.')
  }
}
