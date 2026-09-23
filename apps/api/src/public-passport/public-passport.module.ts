import { Module } from '@nestjs/common'
import { AssetsModule } from '../assets/assets.module.js'
import { PublicPassportController } from './public-passport.controller.js'
import { PublicPassportService } from './public-passport.service.js'

/**
 * Owns the anonymous public passport surface: the public projection, published-asset
 * downloads, the stored QR artifact and the QR redirect.
 *
 * It reads the current immutable published version through Prisma because publication
 * owns those tables, and delegates binary ownership to `AssetsModule` rather than
 * loading `AssetContent` itself.
 */
@Module({
  imports: [AssetsModule],
  controllers: [PublicPassportController],
  providers: [PublicPassportService],
})
export class PublicPassportModule {}
