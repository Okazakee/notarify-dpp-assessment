import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { AnalyticsController } from './analytics.controller.js'
import { AnalyticsService } from './analytics.service.js'
import { AnalyticsIngestLimiter } from './analytics-ingest-limiter.service.js'

/**
 * Owns analytics ingestion and reporting.
 *
 * It reads product, passport and version identity to describe what an event belongs to,
 * and it never writes product content: analytics observes the publication lifecycle
 * rather than participating in it. There is deliberately no queue, worker, scheduler or
 * event bus here — one transaction writes the raw event and its daily aggregate, and the
 * queries read them back.
 *
 * `AuthModule` is imported because the reporting routes are authenticated: the access
 * token guard resolves the authoritative actor, including the role that shapes the
 * response.
 */
@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController],
  exports: [AnalyticsIngestLimiter, AnalyticsService],
  providers: [AnalyticsIngestLimiter, AnalyticsService],
})
export class AnalyticsModule {}
