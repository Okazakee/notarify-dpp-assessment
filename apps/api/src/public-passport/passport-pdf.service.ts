import { Injectable } from '@nestjs/common'
import sharp from 'sharp'
import {
  type PassportPdfImage,
  PDF_IMAGE_MAX_DIMENSION,
  renderPassportPdf,
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
 * Everything is resolved before the caller starts streaming, so an ordinary lifecycle
 * failure still produces the standard JSON 404 instead of a half-written PDF.
 */
@Injectable()
export class PassportPdfService {
  constructor(private readonly passports: PublicPassportService) {}

  async create(publicUuid: string): Promise<{
    document: PDFKit.PDFDocument
    filename: string
  }> {
    const view = await this.passports.getPassportView(publicUuid)
    // The stored Stage 4.1 artifact, never a regenerated code. A passport whose stored
    // QR is missing is unavailable rather than silently given a new identity.
    const qr = await this.passports.getQrPng(publicUuid)

    // Same retention rule as the public asset route, batched: only assets retained by
    // the current active version can come back, so a draft-only or historical-only image
    // is absent even when its id appears in the snapshot.
    const retained = await this.passports.readRetainedAssets(
      publicUuid,
      view.images.map((image) => image.assetId),
    )
    const byAssetId = new Map(retained.map((asset) => [asset.assetId, asset]))

    // Sequential on purpose: one PDF request must not decode the whole gallery at once.
    const images: PassportPdfImage[] = []
    for (const image of view.images) {
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

    return {
      document: renderPassportPdf({ view, qrPng: qr.bytes, images }),
      filename: `notarify-passport-${view.passport.publicUuid}-v${view.passport.version}.pdf`,
    }
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
