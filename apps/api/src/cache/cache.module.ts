import { Module } from '@nestjs/common'
import { PassportContentCache } from './passport-content-cache.service.js'

/**
 * The single infrastructure boundary that owns Redis.
 *
 * Nothing outside this module talks to a cache client: consumers depend on
 * `PassportContentCache`, so the cache stays one narrow, replaceable port instead of
 * Redis calls spreading through controllers, publication, PDF and the frontend.
 */
@Module({
  exports: [PassportContentCache],
  providers: [PassportContentCache],
})
export class CacheModule {}
