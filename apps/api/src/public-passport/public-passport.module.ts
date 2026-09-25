import { Module } from '@nestjs/common'
import { AnalyticsModule } from '../analytics/analytics.module.js'
import { AssetsModule } from '../assets/assets.module.js'
import { CacheModule } from '../cache/cache.module.js'
import { PassportPdfService } from './passport-pdf.service.js'
import { PublicPassportController } from './public-passport.controller.js'
import { PublicPassportService } from './public-passport.service.js'

/**
 * Owns the anonymous public passport surface: the public projection, published-asset
 * downloads, the stored QR artifact, the QR redirect and the PDF export of the current
 * published version.
 *
 * It reads the current immutable published version through Prisma because publication
 * owns those tables, and delegates binary ownership to `AssetsModule` rather than
 * loading `AssetContent` itself. PostgreSQL remains the authority for which version is
 * current and whether the passport is visible; `CacheModule` only accelerates reading
 * the immutable content of the version PostgreSQL already selected.
 */
@Module({
  imports: [AnalyticsModule, AssetsModule, CacheModule],
  controllers: [PublicPassportController],
  providers: [PublicPassportService, PassportPdfService],
})
export class PublicPassportModule {}
