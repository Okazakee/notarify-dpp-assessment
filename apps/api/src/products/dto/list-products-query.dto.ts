import { Type } from 'class-transformer'
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { DATE_ONLY_PATTERN, IsCountryCode } from './shared.dto.js'

export enum ProductStatusFilter {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
}

export class ListProductsQueryDto {
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

  @IsOptional()
  @IsUUID()
  categoryId?: string

  @IsOptional()
  @IsString()
  @IsCountryCode()
  originCountry?: string

  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  productionFrom?: string

  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  productionTo?: string

  @IsOptional()
  @IsString()
  @MaxLength(240)
  q?: string

  @IsOptional()
  @IsEnum(ProductStatusFilter)
  status?: ProductStatusFilter
}
