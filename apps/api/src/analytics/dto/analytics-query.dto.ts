import { Type } from 'class-transformer'
import { IsIn, IsOptional } from 'class-validator'
import { ALLOWED_ANALYTICS_RANGE_DAYS, DEFAULT_ANALYTICS_RANGE_DAYS } from '../analytics.service.js'

/**
 * The bounded ranking range for the Most Viewed section.
 *
 * Only the three assessed windows are accepted. An arbitrary `from`/`to` pair is not
 * supported in this milestone, so a caller cannot ask for an unbounded scan of the
 * analytics tables.
 */
export class AnalyticsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn(ALLOWED_ANALYTICS_RANGE_DAYS)
  range: number = DEFAULT_ANALYTICS_RANGE_DAYS
}
