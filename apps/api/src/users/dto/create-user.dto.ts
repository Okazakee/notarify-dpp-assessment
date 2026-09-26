import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator'
import { UserRole } from '../../generated/prisma/enums.js'

const ROLES: string[] = [UserRole.ADMIN, UserRole.EDITOR]

/**
 * Admin-created credentials.
 *
 * The administrator sets an initial password and communicates it out of band; the project
 * deliberately has no invitation email, reset flow or registration. The bounds are the
 * ones the credential store can hold and a person can reasonably type, and the password
 * minimum is higher than login's because this is where a credential is minted.
 */
export class CreateUserDto {
  @IsEmail()
  @MaxLength(320)
  email!: string

  @IsIn(ROLES)
  role!: UserRole

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string
}
