import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { CategoriesController } from './categories.controller.js'
import { ProductsController } from './products.controller.js'
import { ProductsService } from './products.service.js'

@Module({
  imports: [AuthModule],
  controllers: [ProductsController, CategoriesController],
  providers: [ProductsService],
})
export class ProductsModule {}
