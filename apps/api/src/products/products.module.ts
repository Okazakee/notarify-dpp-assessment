import { Module } from '@nestjs/common'
import { AssetsModule } from '../assets/assets.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { CategoriesController } from './categories.controller.js'
import { ProductsController } from './products.controller.js'
import { ProductsService } from './products.service.js'

@Module({
  imports: [AuthModule, AssetsModule],
  controllers: [ProductsController, CategoriesController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
