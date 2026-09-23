import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { AuthenticatedRequest } from '../auth/access-token.guard.js'
import { AccessTokenGuard } from '../auth/access-token.guard.js'
import { ApiException } from '../common/api-exception.js'
import type { HttpResponse } from '../common/http-types.js'
import type { AssetResponse, UploadedFile as UploadedFileShape } from './asset.types.js'
import { PDF_MIME_TYPE, UPLOAD_MAX_BYTES } from './asset-processing.js'
import { AssetsService } from './assets.service.js'
import { UploadExceptionFilter } from './upload-exception.filter.js'

/** Builds a `Content-Disposition` value that cannot break out of the header. */
function contentDisposition(originalName: string, disposition: 'inline' | 'attachment'): string {
  const asciiFallback = originalName.replace(/[^\u0020-\u007e]/g, '_').replace(/["\\]/g, '_')
  const encoded = encodeURIComponent(originalName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )

  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`
}

/**
 * The response surface this controller needs for a binary body.
 *
 * `end` is used directly rather than returning the buffer: Nest's reply logic treats
 * an object body as JSON, which would serialize the buffer as `{"type":"Buffer"...}`
 * instead of streaming the bytes.
 */
type BinaryHttpResponse = HttpResponse & {
  end(body: Buffer): void
}

@Controller('assets')
@UseGuards(AccessTokenGuard)
@UseFilters(UploadExceptionFilter)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  /**
   * Accepts one file per request as `multipart/form-data`.
   *
   * The hard byte cap is applied while the body is read, so an oversized request is
   * rejected before it is fully buffered. The declared MIME type and the filename are
   * ignored for validation purposes; they never reach storage as authoritative facts.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: UPLOAD_MAX_BYTES, files: 1, fields: 0 },
    }),
  )
  async upload(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file?: UploadedFileShape,
  ): Promise<AssetResponse> {
    const actor = request.currentActor
    if (actor === undefined) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_ACCESS_TOKEN',
        'Invalid access token.',
      )
    }

    return this.assets.create(actor.companyId, actor.id, file)
  }

  /**
   * Streams an accepted asset back to its owning company.
   *
   * There is no public variant of this route and no filesystem path involved. The
   * response type is the server-detected MIME type, never the client's, and
   * `nosniff` stops a browser from reinterpreting the bytes as something else.
   */
  @Get(':id')
  async download(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() response: BinaryHttpResponse,
  ): Promise<void> {
    const actor = request.currentActor
    if (actor === undefined) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_ACCESS_TOKEN',
        'Invalid access token.',
      )
    }

    const asset = await this.assets.findForDownload(actor.companyId, id)
    const isPdf = asset.detectedMime === PDF_MIME_TYPE

    response.setHeader('Content-Type', asset.detectedMime)
    response.setHeader('Content-Length', String(asset.bytes.length))
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader(
      'Content-Disposition',
      contentDisposition(asset.originalName, isPdf ? 'attachment' : 'inline'),
    )

    response.end(asset.bytes)
  }
}
