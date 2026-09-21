import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator'
import { NestedProductFieldsDto } from './nested-product.dto.js'
import { DATE_ONLY_PATTERN, IsCountryCode } from './shared.dto.js'

export class CreateProductDto extends NestedProductFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  name?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sku?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(160)
  serialNumber?: string | null

  @IsOptional()
  @IsUUID()
  categoryId?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string | null

  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  productionDate?: string | null

  @IsOptional()
  @IsString()
  @IsCountryCode()
  originCountry?: string | null
}
