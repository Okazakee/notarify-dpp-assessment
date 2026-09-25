import { SetMetadata } from '@nestjs/common'
import type { UserRole } from '../generated/prisma/enums.js'

export const ROLES_METADATA_KEY = 'requiredRoles'

/**
 * Restricts a route to the listed roles.
 *
 * This is an authorization rule for endpoints that are deliberately narrower than the
 * default authenticated surface. It is not a general permission system: the project's
 * permission matrix still has unresolved rows, and inventing a role hierarchy here
 * would pretend those decisions are settled.
 */
export function Roles(...roles: UserRole[]): MethodDecorator & ClassDecorator {
  return SetMetadata(ROLES_METADATA_KEY, roles)
}
