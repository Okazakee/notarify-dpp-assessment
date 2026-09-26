import { Body, Controller, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { AuthenticatedRequest } from '../auth/access-token.guard.js'
import { AccessTokenGuard } from '../auth/access-token.guard.js'
import { ApiException } from '../common/api-exception.js'
import { PublishProductDto } from './dto/publish-product.dto.js'
import { PublicationService } from './publication.service.js'
import type { PublicationResult } from './publication.types.js'

/**
 * Publication route.
 *
 * Declared on the `products` base path so the assessment's required
 * `POST /products/{id}/publish` shape is preserved, while the transaction itself is
 * owned by `PublicationModule` rather than by the catalog module.
 */
@ApiTags('publication')
@Controller('products')
@UseGuards(AccessTokenGuard)
export class PublicationController {
  constructor(private readonly publication: PublicationService) {}

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() input: PublishProductDto,
  ): Promise<PublicationResult> {
    const actor = request.currentActor
    if (actor === undefined) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_ACCESS_TOKEN',
        'Invalid access token.',
      )
    }

    return this.publication.publish(
      actor.companyId,
      actor.id,
      id,
      input.expectedDraftRevision,
      request.requestId ?? null,
    )
  }
}
