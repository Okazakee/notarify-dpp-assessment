import { IsBoolean, IsIn, IsOptional } from 'class-validator'
import { UserRole } from '../../generated/prisma/enums.js'

const ROLES: string[] = [UserRole.ADMIN, UserRole.EDITOR]

/**
 * The only mutable administration fields.
 *
 * Role and activation are the whole surface: there is no profile editing, no email
 * change and no password reset here. Both fields are optional, so a request that changes
 * one leaves the other alone, and a request that changes neither is a no-op that records
 * no audit row.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsIn(ROLES)
  role?: UserRole

  @IsOptional()
  @IsBoolean()
  active?: boolean
}
