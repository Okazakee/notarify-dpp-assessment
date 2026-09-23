import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
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

/** Attachment limits, locked for this milestone. */
export const MAX_GALLERY_IMAGES = 12
/** One cover plus the gallery allowance. */
export const MAX_PRODUCT_IMAGES = MAX_GALLERY_IMAGES + 1
export const MAX_PRODUCT_DOCUMENTS = 20
export const MAX_CERTIFICATIONS = 20

export const IMAGE_ROLES = ['COVER', 'GALLERY'] as const
export const DOCUMENT_KINDS = ['MANUAL', 'WARRANTY', 'TECHNICAL_DATASHEET'] as const

export type ImageRoleInput = (typeof IMAGE_ROLES)[number]
export type DocumentKindInput = (typeof DOCUMENT_KINDS)[number]

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

  /**
   * Optional PDF asset for this certification.
   *
   * A certification PDF is never mandatory for a draft save; publication
   * completeness is decided later, not here.
   */
  @IsOptional()
  @IsUUID()
  pdfAssetId?: string | null
}

export class ImageInputDto {
  @IsUUID()
  assetId!: string

  @IsIn(IMAGE_ROLES)
  role!: ImageRoleInput

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number

  @IsOptional()
  @IsString()
  @MaxLength(240)
  altText?: string | null
}

export class DocumentInputDto {
  @IsUUID()
  assetId!: string

  @IsIn(DOCUMENT_KINDS)
  kind!: DocumentKindInput

  @IsOptional()
  @IsString()
  @MaxLength(240)
  title?: string | null

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number
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
  @ArrayMaxSize(MAX_CERTIFICATIONS)
  @ValidateNested({ each: true })
  @Type(() => CertificationInputDto)
  certifications?: CertificationInputDto[]

  /**
   * Cover and gallery image associations.
   *
   * Supplying this array replaces the whole image collection, matching how
   * materials and certifications already behave.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PRODUCT_IMAGES)
  @ValidateNested({ each: true })
  @Type(() => ImageInputDto)
  images?: ImageInputDto[]

  /** Supplying this array replaces the whole document collection. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PRODUCT_DOCUMENTS)
  @ValidateNested({ each: true })
  @Type(() => DocumentInputDto)
  documents?: DocumentInputDto[]
}
