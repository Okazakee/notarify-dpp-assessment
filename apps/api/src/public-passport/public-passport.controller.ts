import { Controller, Get, Header, HttpStatus, Param, Res } from '@nestjs/common'
import { PDF_MIME_TYPE } from '../assets/asset-processing.js'
import { type BinaryHttpResponse, writeBinaryResponse } from '../common/binary-response.js'
import { type PassportView, passportNotFound } from './passport-view.js'
import { PublicPassportService } from './public-passport.service.js'

/**
 * The anonymous public passport surface.
 *
 * Deliberately has no guard, no cookie requirement and no session: everything it serves
 * is content that was explicitly published. Authorization is per request and derived
 * from the current immutable published version, never from the request itself.
 */
@Controller()
export class PublicPassportController {
  constructor(private readonly passports: PublicPassportService) {}

  /** The public projection of the current published version. */
  @Get('passport/:uuid')
  // Published content must not outlive a republish or withdrawal in a shared cache.
  @Header('Cache-Control', 'no-store')
  async view(@Param('uuid') uuid: string): Promise<PassportView> {
    return this.passports.getPassportView(uuid)
  }

  /**
   * Serves the stored QR artifact.
   *
   * These are the bytes generated on first publication, so a printed code keeps working
   * across republishes. A download records nothing and is not a scan.
   */
  @Get('passport/:uuid/qr.png')
  async qr(@Param('uuid') uuid: string, @Res() response: BinaryHttpResponse): Promise<void> {
    const qr = await this.passports.getQrPng(uuid)

    writeBinaryResponse(response, qr.bytes, {
      contentType: 'image/png',
      originalName: qr.filename,
      disposition: 'attachment',
      // Publicly readable by design, and embeddable from the web origin.
      crossOriginResourcePolicy: 'cross-origin',
    })
  }

  /**
   * Serves a published asset's bytes.
   *
   * Two independent conditions must hold: the asset must be retained by the current
   * active published version, and it must still be an accepted asset with stored
   * content. Failing either yields the same 404 as an unavailable passport, so an
   * arbitrary, draft-only, historical or foreign asset id cannot be distinguished from a
   * passport that does not exist.
   */
  @Get('passport/:uuid/assets/:assetId')
  async asset(
    @Param('uuid') uuid: string,
    @Param('assetId') assetId: string,
    @Res() response: BinaryHttpResponse,
  ): Promise<void> {
    const authorized = await this.passports.authorizePublishedAsset(uuid, assetId)
    if (!authorized) {
      throw passportNotFound()
    }

    const asset = await this.passports.readAcceptedAsset(assetId)
    if (asset === null) {
      throw passportNotFound()
    }

    writeBinaryResponse(response, asset.bytes, {
      contentType: asset.detectedMime,
      originalName: asset.originalName,
      // PDFs download rather than render inline; images stay inline for the public page.
      disposition: asset.detectedMime === PDF_MIME_TYPE ? 'attachment' : 'inline',
      // The public page embeds these bytes, so the browser must be allowed to use a
      // cross-origin response. Authorization is unchanged: it is still derived from the
      // current immutable published version, not from the request.
      crossOriginResourcePolicy: 'cross-origin',
    })
  }

  /**
   * Resolves a printed QR code.
   *
   * The location is built from validated configuration plus the stored public UUID, so
   * the request's `Host` header can never influence where a scan lands. Stage 5 can
   * record a QR hit here without changing any printed URL.
   */
  @Get('q/:uuid')
  async resolveQr(@Param('uuid') uuid: string, @Res() response: BinaryHttpResponse): Promise<void> {
    const location = await this.passports.getQrRedirectTarget(uuid)

    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Location', location)
    response.status(HttpStatus.FOUND)
    response.end(Buffer.alloc(0))
  }
}
