import { Module } from '@nestjs/common'
import { AssetsModule } from '../assets/assets.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { ProductsModule } from '../products/products.module.js'
import { PublicationController } from './publication.controller.js'
import { PublicationService } from './publication.service.js'

/**
 * Owns the publish transaction, immutable version creation, retained asset references
 * and the QR artifact.
 *
 * It consumes `ProductsService` for draft content and `AssetsService` for asset
 * authorization rather than reading those tables itself, so each module stays the owner
 * of its own rules.
 */
@Module({
  imports: [AuthModule, ProductsModule, AssetsModule],
  controllers: [PublicationController],
  providers: [PublicationService],
})
export class PublicationModule {}
