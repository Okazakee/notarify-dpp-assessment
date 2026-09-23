import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { ProductsModule } from '../products/products.module.js'
import { PublicationController } from './publication.controller.js'
import { PublicationService } from './publication.service.js'

/**
 * Owns the publish transaction, immutable version creation, retained asset references
 * and the QR artifact.
 *
 * It consumes `ProductsService` for draft content rather than reading product tables
 * itself, so the catalog module stays the owner of what a draft contains.
 */
@Module({
  imports: [AuthModule, ProductsModule],
  controllers: [PublicationController],
  providers: [PublicationService],
})
export class PublicationModule {}
