import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AssetsController } from './assets.controller.js'
import { AssetsService } from './assets.service.js'

/**
 * Owns asset validation, storage and access.
 *
 * Other modules consume `AssetsService` rather than querying asset tables
 * themselves, so the authorization rule for which assets may be referenced lives in
 * exactly one place.
 */
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
