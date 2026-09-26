/**
 * The user-administration response contracts, validated at the boundary.
 *
 * The API is the authority for these shapes; this module re-declares what the UI reads and
 * checks it before rendering, so a malformed response is a visible error rather than an
 * undefined cell. No credential state is part of the contract.
 */

export type UserRole = 'ADMIN' | 'EDITOR'

export type UserSummary = {
  id: string
  email: string
  role: UserRole
  active: boolean
  createdAt: string
  updatedAt: string
}

export type UserListResponse = {
  items: UserSummary[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isUserSummary(value: unknown): value is UserSummary {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.email === 'string' &&
    (value.role === 'ADMIN' || value.role === 'EDITOR') &&
    typeof value.active === 'boolean' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

export function isUserListResponse(value: unknown): value is UserListResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isUserSummary) &&
    typeof value.page === 'number' &&
    typeof value.pageSize === 'number' &&
    typeof value.total === 'number' &&
    typeof value.totalPages === 'number'
  )
}
