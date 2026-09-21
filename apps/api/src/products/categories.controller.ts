import { Controller, Get, UseGuards } from '@nestjs/common'
import { AccessTokenGuard } from '../auth/access-token.guard.js'
import { ProductsService } from './products.service.js'

@Controller('categories')
@UseGuards(AccessTokenGuard)
export class CategoriesController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(): Promise<Array<{ id: string; stableCode: string; name: string }>> {
    return this.products.listCategories()
  }
}
