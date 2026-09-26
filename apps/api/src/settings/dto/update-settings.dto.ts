import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator'

/**
 * The mutable company settings.
 *
 * The company itself is never part of the request: it is always the actor's company, so a
 * caller cannot address another one. `logoAssetId` is explicitly nullable so clearing the
 * logo is a real, stated operation rather than an omission.
 */
export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  displayName?: string

  @IsOptional()
  @IsUUID()
  logoAssetId?: string | null
}
