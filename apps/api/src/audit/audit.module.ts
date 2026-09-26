import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { AuditController } from './audit.controller.js'
import { AuditService } from './audit.service.js'

/**
 * Owns the audit surface: one transactional append used by the owning modules, and one
 * Admin-only company-scoped read.
 *
 * It exports only the service. The owning modules call `AuditService.record` with their
 * own transaction client, so no module reaches into another module's tables to write an
 * audit row, and there is no queue, bus or external sink to reason about.
 */
@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  exports: [AuditService],
  providers: [AuditService],
})
export class AuditModule {}
