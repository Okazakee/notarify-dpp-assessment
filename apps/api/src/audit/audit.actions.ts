/**
 * The stable action names recorded in `AuditEvent.action`.
 *
 * They are constants rather than freehand strings so a typo cannot silently create a
 * second, near-identical action name that no reader knows about. The list is deliberately
 * short: it covers the mutations this milestone audits and nothing speculative.
 */
export const AUDIT_ACTIONS = {
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_DELETED: 'PRODUCT_DELETED',
  PASSPORT_VERSION_PUBLISHED: 'PASSPORT_VERSION_PUBLISHED',
  USER_CREATED: 'USER_CREATED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_ACTIVATED: 'USER_ACTIVATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  COMPANY_SETTINGS_UPDATED: 'COMPANY_SETTINGS_UPDATED',
} as const

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]

/**
 * The entity a record describes.
 *
 * `PRODUCT_DELETED` targets the Product and `PASSPORT_VERSION_PUBLISHED` targets the
 * Passport, so a reader can follow one identity per action rather than guessing which id
 * a row carries. The Passport id is included in the publication metadata.
 */
export const AUDIT_ENTITY_TYPES = {
  PRODUCT: 'Product',
  PASSPORT: 'Passport',
  USER: 'User',
  COMPANY: 'Company',
} as const

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[keyof typeof AUDIT_ENTITY_TYPES]

/** The bounded metadata keys this milestone writes, so a reader knows the vocabulary. */
export type AuditSafeMetadata = {
  changedFields?: string[]
  draftRevisionBefore?: number
  draftRevisionAfter?: number
  versionNumber?: number
  sourceDraftRevision?: number
  passportId?: string
  hadPublishedPassport?: boolean
  roleBefore?: string
  roleAfter?: string
  activeBefore?: boolean
  activeAfter?: boolean
  revokedSessionCount?: number
}
