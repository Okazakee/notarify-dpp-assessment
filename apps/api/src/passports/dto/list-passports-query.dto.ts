import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

/**
 * Bounded pagination for the back-office passport list.
 *
 * Deliberately the same shape and limits as the product list, so the two back-office
 * tables do not invent competing paging conventions.
 */
export class ListPassportsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20
}
