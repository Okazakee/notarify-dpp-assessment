import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { DATE_ONLY_PATTERN, IsCountryCode } from './shared.dto.js'

export class MaterialInputDto {
  @IsOptional()
  @IsUUID()
  id?: string

  @IsString()
  @MaxLength(160)
  name!: string

  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  percentage!: number

  @IsOptional()
  @IsString()
  @IsCountryCode()
  originCountry?: string | null

  @IsOptional()
  @IsBoolean()
  recyclable?: boolean | null

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number
}

export class SustainabilityInputDto {
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @Min(0)
  carbonKgCo2e?: number | null

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @Min(0)
  waterLitres?: number | null

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  recycledPercent?: number | null

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10)
  repairabilityScore?: number | null

  @IsOptional()
  @IsBoolean()
  recyclable?: boolean | null
}

export class CertificationInputDto {
  @IsOptional()
  @IsUUID()
  id?: string

  @IsOptional()
  @IsString()
  @MaxLength(240)
  name?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(240)
  issuingAuthority?: string | null

  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  issueDate?: string | null

  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  expirationDate?: string | null
}

export class NestedProductFieldsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => MaterialInputDto)
  materials?: MaterialInputDto[]

  @IsOptional()
  @ValidateNested()
  @Type(() => SustainabilityInputDto)
  sustainability?: SustainabilityInputDto | null

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CertificationInputDto)
  certifications?: CertificationInputDto[]
}
