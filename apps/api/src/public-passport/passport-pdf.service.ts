import { Injectable } from '@nestjs/common'
import sharp from 'sharp'
import { passportUnavailable } from '../publication/passport-snapshot-content.js'
import {
  createPassportPdfDocument,
  drawPassportPdf,
  type PassportPdfDocument,
  type PassportPdfImage,
  PDF_IMAGE_MAX_DIMENSION,
} from './passport-pdf-document.js'
import { PublicPassportService } from './public-passport.service.js'

const JPEG_MIME = 'image/jpeg'
const PNG_MIME = 'image/png'
const WEBP_MIME = 'image/webp'

/**
 * Builds the PDF export of the current published passport.
 *
 * This service owns orchestration only: lifecycle and asset authorization belong to
 * `PublicPassportService`, and layout belongs to `passport-pdf-document.ts`. It resolves
 * the same current active version the public page serves, so a PDF can never describe a
 * draft, a historical version or another passport's content.
 *
 * `create` performs the whole preflight — active version, snapshot projection, stored QR
 * validation and retained image preparation — and returns a document shell plus a draw
 * callback. The caller can therefore pipe the empty document to the client before any
 * content is written, while every ordinary lifecycle or data failure is still raised
 * before a single PDF header is sent.
 */
@Injectable()
export class PassportPdfService {
  constructor(private readonly passports: PublicPassportService) {}

  async create(publicUuid: string): Promise<{
    document: PassportPdfDocument
    draw: () => void
    filename: string
  }> {
    const source = await this.passports.getCurrentVersionExport(publicUuid)

    // The stored Stage 4.1 artifact, never a regenerated code. A corrupt or absent
    // artifact makes the export unavailable instead of silently printing a new identity.
    await assertUsableQrPng(source.qrPng)

    // Same retention rule as the public asset route, applied to one resolved version.
    const byAssetId = new Map(source.retainedImages.map((asset) => [asset.assetId, asset] as const))

    // Sequential on purpose: one PDF request must not decode the whole gallery at once.
    const images: PassportPdfImage[] = []
    for (const image of source.view.images) {
      const asset = byAssetId.get(image.assetId)
      if (asset === undefined) {
        continue
      }
      const prepared = await preparePdfImage(asset.bytes, asset.detectedMime)
      if (prepared === null) {
        continue
      }
      images.push({
        role: image.role,
        altText: image.altText,
        bytes: prepared.bytes,
        mime: prepared.mime,
      })
    }

    const document = createPassportPdfDocument(source.view)
    const pdfSource = { view: source.view, qrPng: source.qrPng, images }

    return {
      document,
      draw: () => {
        drawPassportPdf(document, pdfSource)
      },
      filename: `notarify-passport-${source.view.passport.publicUuid}-v${source.view.passport.version}.pdf`,
    }
  }
}

/**
 * Proves the stored QR artifact is a decodable PNG before the response starts.
 *
 * PDFKit would otherwise draw a placeholder into an otherwise successful PDF, which
 * would look like a valid export of a passport whose identity artifact is broken.
 */
async function assertUsableQrPng(bytes: Buffer): Promise<void> {
  try {
    const metadata = await sharp(bytes).metadata()
    if (
      metadata.format !== 'png' ||
      metadata.width === undefined ||
      metadata.height === undefined
    ) {
      throw new Error('unusable QR artifact')
    }
  } catch {
    throw passportUnavailable()
  }
}

/**
 * Returns a PDFKit-embeddable representation of a stored image, or `null` when the
 * stored bytes cannot be used.
 *
 * PDFKit embeds JPEG and PNG directly. WebP is accepted by the upload pipeline but is
 * not a PDF image format, so it is converted in memory with `sharp`; the stored asset is
 * never mutated and no new asset is created. Oversized images are bounded to a
 * PDF-only maximum on the longest side and never upscaled.
 */
async function preparePdfImage(
  bytes: Buffer,
  detectedMime: string,
): Promise<{ bytes: Buffer; mime: 'image/jpeg' | 'image/png' } | null> {
  if (detectedMime !== JPEG_MIME && detectedMime !== PNG_MIME && detectedMime !== WEBP_MIME) {
    return null
  }

  try {
    const image = sharp(bytes)
    const metadata = await image.metadata()
    const longestSide = Math.max(metadata.width ?? 0, metadata.height ?? 0)
    const needsResize = longestSide > PDF_IMAGE_MAX_DIMENSION

    if (!needsResize && detectedMime !== WEBP_MIME) {
      // Already small enough and already a format PDFKit can embed: use the stored
      // bytes unchanged rather than re-encoding them for no benefit.
      return { bytes, mime: detectedMime === JPEG_MIME ? JPEG_MIME : PNG_MIME }
    }

    const pipeline = needsResize
      ? image.resize({
          width: PDF_IMAGE_MAX_DIMENSION,
          height: PDF_IMAGE_MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
      : image

    if (detectedMime === JPEG_MIME) {
      return { bytes: await pipeline.jpeg({ quality: 85 }).toBuffer(), mime: JPEG_MIME }
    }
    // PNG and WebP both become PNG so transparency survives the conversion.
    return { bytes: await pipeline.png().toBuffer(), mime: PNG_MIME }
  } catch {
    return null
  }
}
