import { Module } from '@nestjs/common'
import { HealthController } from './health.controller.js'

/**
 * Owns the container health surface.
 *
 * The readiness probe reads through `PrismaService`, the same connection the application
 * serves from, so "ready" means the real authoritative store answered.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
