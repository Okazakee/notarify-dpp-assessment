import type { Prisma } from '../generated/prisma/client.js'

/**
 * What an audited mutation must supply.
 *
 * `actorId` is the authoritative actor the access-token guard resolved from PostgreSQL, and
 * `requestId` is the id the request middleware resolved: it accepts a bounded, well-formed
 * inbound `x-request-id` and otherwise generates one, so the value recorded here is
 * already-sanitized correlation data rather than an arbitrary client string.
 */
export type AuditRecordInput = {
  actorId: string
  entityType: string
  entityId: string
  action: string
  requestId: string | null
  safeMetadata?: Prisma.InputJsonValue
}

/** The audit context a controller passes down to the owning service. */
export type AuditContext = {
  actorId: string
  companyId: string
  requestId: string | null
}

export type AuditLogEntry = {
  id: string
  occurredAt: string
  action: string
  entityType: string
  entityId: string
  requestId: string | null
  safeMetadata: unknown
  actor: {
    id: string
    email: string
    role: string
  } | null
}

export type AuditLogListResponse = {
  items: AuditLogEntry[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}
