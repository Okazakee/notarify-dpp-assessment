import type { UserRole } from '../generated/prisma/enums.js'

/**
 * A user as the administration UI sees one.
 *
 * The projection is deliberately closed: no password hash, no session state, no token
 * metadata and no internal counters. `active` is the operational flag the Admin manages,
 * and the timestamps are the row's own.
 */
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
