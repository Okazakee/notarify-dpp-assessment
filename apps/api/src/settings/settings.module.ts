import { Module } from '@nestjs/common'
import { AssetsModule } from '../assets/assets.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { SettingsController } from './settings.controller.js'
import { SettingsService } from './settings.service.js'

/**
 * Owns company settings.
 *
 * `AssetsModule` supplies the company-scoped image rule the logo needs, so the settings
 * module does not re-implement asset authorization, and `AuditModule` supplies the
 * transactional append every settings change commits with.
 */
@Module({
  imports: [AuthModule, AssetsModule, AuditModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
