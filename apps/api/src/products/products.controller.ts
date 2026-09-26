import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { AuditContext } from '../audit/audit.types.js'
import type { AuthenticatedRequest } from '../auth/access-token.guard.js'
import { AccessTokenGuard } from '../auth/access-token.guard.js'
import { Roles } from '../auth/roles.decorator.js'
import { RolesGuard } from '../auth/roles.guard.js'
import { ApiException } from '../common/api-exception.js'
import { UserRole } from '../generated/prisma/enums.js'
import { CreateProductDto } from './dto/create-product.dto.js'
import { ListProductsQueryDto } from './dto/list-products-query.dto.js'
import { PatchProductDto } from './dto/patch-product.dto.js'
import type { ProductDetail, ProductListResponse } from './product.types.js'
import { ProductsService } from './products.service.js'

/**
 * The Product back office.
 *
 * Every route requires an authenticated actor, and deletion is narrower than the rest:
 * `RolesGuard` runs after `AccessTokenGuard` and refuses an Editor before any ownership or
 * existence query, so the refusal cannot be used to probe for a product.
 */
@ApiTags('products')
@Controller('products')
@UseGuards(AccessTokenGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateProductDto,
  ): Promise<ProductDetail> {
    return this.products.create(this.auditContext(request), input)
  }

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListProductsQueryDto,
  ): Promise<ProductListResponse> {
    return this.products.list(this.actorCompanyId(request), query)
  }

  @Get(':id')
  async findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<ProductDetail> {
    return this.products.findOne(this.actorCompanyId(request), id)
  }

  @Patch(':id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() input: PatchProductDto,
  ): Promise<ProductDetail> {
    return this.products.update(this.auditContext(request), id, input)
  }

  /**
   * Soft-deletes a product, withdrawing its Passport in the same transaction.
   *
   * Admin-only, and deliberately without a request body: the target is the path id, and
   * the server owns the lifecycle timestamp. Success is `204`, because there is no
   * remaining representation of the product to return.
   */
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.products.delete(this.auditContext(request), id)
  }

  private actorCompanyId(request: AuthenticatedRequest): string {
    const companyId = request.currentActor?.companyId
    if (!companyId) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_ACCESS_TOKEN',
        'Invalid access token.',
      )
    }
    return companyId
  }

  /**
   * The actor, company and resolved request id an audited mutation records.
   *
   * The request id is the one the application's own middleware accepted: it keeps a bounded,
   * well-formed inbound `x-request-id` for correlation and generates a fresh id otherwise.
   */
  private auditContext(request: AuthenticatedRequest): AuditContext {
    const actor = request.currentActor
    if (!actor) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_ACCESS_TOKEN',
        'Invalid access token.',
      )
    }
    return {
      actorId: actor.id,
      companyId: actor.companyId,
      requestId: request.requestId ?? null,
    }
  }
}
