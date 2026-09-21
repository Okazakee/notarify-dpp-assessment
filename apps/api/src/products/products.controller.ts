import {
  Body,
  Controller,
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
import type { AuthenticatedRequest } from '../auth/access-token.guard.js'
import { AccessTokenGuard } from '../auth/access-token.guard.js'
import { ApiException } from '../common/api-exception.js'
import { CreateProductDto } from './dto/create-product.dto.js'
import { ListProductsQueryDto } from './dto/list-products-query.dto.js'
import { PatchProductDto } from './dto/patch-product.dto.js'
import type { ProductDetail, ProductListResponse } from './product.types.js'
import { ProductsService } from './products.service.js'

@Controller('products')
@UseGuards(AccessTokenGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateProductDto,
  ): Promise<ProductDetail> {
    return this.products.create(this.actorCompanyId(request), input)
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
    return this.products.update(this.actorCompanyId(request), id, input)
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
}
