import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AnalyticsIngestLimiter } from '../analytics/analytics-ingest-limiter.service.js'
import {
  extractAnalyticsMetadata,
  isPrefetchRequest,
} from '../analytics/analytics-request-metadata.js'
import { ViewEventDto } from '../analytics/dto/view-event.dto.js'
import { PDF_MIME_TYPE } from '../assets/asset-processing.js'
import { ApiException } from '../common/api-exception.js'
import {
  type BinaryHttpResponse,
  contentDisposition,
  writeBinaryResponse,
} from '../common/binary-response.js'
import type { ParsedRequest } from '../common/http-types.js'
import type { AppEnvironment } from '../config/configuration.js'
import { PassportPdfService } from './passport-pdf.service.js'
import { type StreamingHttpResponse, streamPdfResponse } from './passport-pdf-stream.js'
import { type PassportView, passportNotFound } from './passport-view.js'
import { PublicPassportService } from './public-passport.service.js'

/**
 * What the analytics pipeline reads from an incoming public request.
 *
 * `ip` is the address the runtime resolved for the socket, not a header: the application
 * does not enable proxy trust, so a forged `X-Forwarded-For` never becomes the recorded
 * address.
 */
type PublicAnalyticsRequest = ParsedRequest & {
  ip?: string
  method?: string
}

/**
 * How long a QR redirect is willing to wait for its scan to be recorded.
 *
 * Recording is best-effort and must never gate the redirect, so the write is awaited only
 * within this budget: a slow or wedged analytics insert delays the scan by at most this,
 * and the write continues in the background while the redirect already happened.
 */
const QR_RECORD_BUDGET_MS = 250

/**
 * The anonymous public passport surface.
 *
 * Deliberately has no guard, no cookie requirement and no session: everything it serves
 * is content that was explicitly published. Authorization is per request and derived
 * from the current immutable published version, never from the request itself.
 */
@Controller()
export class PublicPassportController {
  private readonly logger = new Logger(PublicPassportController.name)

  constructor(
    private readonly passports: PublicPassportService,
    private readonly pdfExport: PassportPdfService,
    private readonly config: ConfigService<AppEnvironment, true>,
    private readonly ingestLimiter: AnalyticsIngestLimiter,
  ) {}

  /** The public projection of the current published version. */
  @Get('passport/:uuid')
  // Published content must not outlive a republish or withdrawal in a shared cache.
  @Header('Cache-Control', 'no-store')
  async view(@Param('uuid') uuid: string): Promise<PassportView> {
    return this.passports.getPassportView(uuid)
  }

  /**
   * Exports the current published passport as a PDF.
   *
   * Intentionally anonymous, because the current passport it exports is already
   * anonymous. It uses exactly the same active-visibility resolution as `GET
   * /passport/:uuid`, so malformed, unknown, withdrawn and deleted states all produce the
   * same safe 404 as JSON.
   *
   * The document is generated from the current immutable published version, embeds the
   * stored QR artifact and streams directly to the client. A historical version has no
   * PDF route.
   */
  @Get('passport/:uuid/pdf')
  // Route-level, so a preflight failure also carries `no-store` rather than only a
  // successful download. A republish moves the current version while the public UUID
  // stays stable, so the export must never be served from a shared cache.
  @Header('Cache-Control', 'no-store')
  async pdf(
    @Req() request: ParsedRequest,
    @Param('uuid') uuid: string,
    @Res() response: StreamingHttpResponse,
  ): Promise<void> {
    // Everything is resolved before a single byte of PDF is written, so an ordinary
    // lifecycle failure is still the standard JSON 404 rather than a half-started file.
    const { document, draw, filename } = await this.pdfExport.create(uuid)

    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Disposition', contentDisposition(filename, 'attachment'))
    response.setHeader('X-Content-Type-Options', 'nosniff')
    // Deliberately public downloadable content, and the web origin is not necessarily
    // the API origin.
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')

    await streamPdfResponse({
      response,
      document,
      draw,
      onError: (error: unknown) => {
        // Once streaming has begun there is nothing safe left to send. The response is
        // aborted by the helper rather than finished, so a truncated body is never
        // presented as a complete download, and only a safe diagnostic is logged.
        this.logger.error(
          `Passport PDF streaming failed requestId=${request.requestId ?? 'unknown'} error=${
            error instanceof Error ? error.name : 'unknown'
          }`,
        )
      },
    })
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
   * Records one rendered-page view.
   *
   * Anonymous, like the page it describes. The body carries only an idempotency key and
   * the public version the page rendered; the time, address, browser, operating system,
   * language, country and synthetic flag are all resolved by the server, and unknown
   * body properties are rejected rather than ignored.
   *
   * A retry with the same key is a no-op, so the client can retry a transient failure
   * safely. Ingestion is separate from page delivery: the Passport itself stays readable
   * whether or not this endpoint succeeds.
   */
  @Post('passport/:uuid/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  // A recorded event is never cacheable, and neither is its failure.
  @Header('Cache-Control', 'no-store')
  async recordView(
    @Req() request: PublicAnalyticsRequest,
    @Param('uuid') uuid: string,
    @Body() body: ViewEventDto,
  ): Promise<void> {
    const metadata = extractAnalyticsMetadata({
      headers: request.headers,
      ip: request.ip,
      mockCountry: this.config.getOrThrow<string>('ANALYTICS_MOCK_COUNTRY'),
      source: 'PUBLIC_PAGE',
    })

    if (
      !this.ingestLimiter.take({ kind: 'VIEW', ipAddress: metadata.ipAddress, publicUuid: uuid })
    ) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        'ANALYTICS_RATE_LIMITED',
        'Too many analytics events.',
      )
    }

    await this.passports.recordView({
      publicUuid: uuid,
      version: body.version,
      eventKey: body.eventKey,
      metadata,
    })
  }

  /**
   * Resolves a printed QR code.
   *
   * The location is built from validated configuration plus the stored public UUID, so
   * the request's `Host` header can never influence where a scan lands.
   *
   * A real navigation is recorded as a QR hit, and analytics never gates the redirect: a
   * refused, failed or rate-limited recording still returns the same 302 for a valid
   * Passport. `HEAD` and obvious prefetch requests are not counted.
   */
  @Get('q/:uuid')
  async resolveQr(
    @Req() request: PublicAnalyticsRequest,
    @Param('uuid') uuid: string,
    @Res() response: BinaryHttpResponse,
  ): Promise<void> {
    const scan = await this.passports.getQrScan(uuid)

    if (request.method !== 'HEAD' && !isPrefetchRequest(request.headers)) {
      // Analytics is an observation of a scan, never a condition for it: any failure in
      // this block — metadata, throttle or storage — is contained here so the valid
      // Passport below still redirects.
      try {
        const metadata = extractAnalyticsMetadata({
          headers: request.headers,
          ip: request.ip,
          mockCountry: this.config.getOrThrow<string>('ANALYTICS_MOCK_COUNTRY'),
          source: 'QR_REDIRECT',
        })

        if (
          this.ingestLimiter.take({
            kind: 'QR_HIT',
            ipAddress: metadata.ipAddress,
            publicUuid: uuid,
          })
        ) {
          // Bounded, not awaited indefinitely: see `QR_RECORD_BUDGET_MS`.
          await Promise.race([
            this.passports.recordQrHit({
              passportId: scan.passportId,
              versionId: scan.versionId,
              metadata,
            }),
            new Promise<void>((resolve) => {
              setTimeout(resolve, QR_RECORD_BUDGET_MS)
            }),
          ])
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown error'
        this.logger.warn(`QR scan recording failed, redirecting anyway: ${reason}`)
      }
    }

    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Location', scan.location)
    response.status(HttpStatus.FOUND)
    response.end(Buffer.alloc(0))
  }
}
