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
import { type BinaryHttpResponse, writeBinaryResponse } from '../common/binary-response.js'
import type { AssetResponse, UploadedFile as UploadedFileShape } from './asset.types.js'
import { PDF_MIME_TYPE, UPLOAD_MAX_BYTES } from './asset-processing.js'
import { AssetsService } from './assets.service.js'
import { UploadExceptionFilter } from './upload-exception.filter.js'

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

    writeBinaryResponse(response, asset.bytes, {
      contentType: asset.detectedMime,
      originalName: asset.originalName,
      disposition: isPdf ? 'attachment' : 'inline',
      // Authenticated content is private to the company and never cached by a shared
      // cache; the anonymous route below uses plain `no-store`.
      cacheControl: 'private, no-store',
    })
  }
}
