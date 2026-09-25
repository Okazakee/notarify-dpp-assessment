import { Module } from '@nestjs/common'
import { AssetsModule } from '../assets/assets.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { PassportsController } from './passports.controller.js'
import { PassportsService } from './passports.service.js'

/**
 * Owns the authenticated back-office passport surface: the company passport list,
 * current-publication metadata, version history and historical asset retrieval.
 *
 * It consumes `AssetsService` for asset bytes rather than reading `AssetContent`
 * itself, and it reads passport tables through Prisma the way `public-passport` does,
 * because both are read projections of publication-owned data.
 */
@Module({
  imports: [AuthModule, AssetsModule],
  controllers: [PassportsController],
  providers: [PassportsService],
})
export class PassportsModule {}
