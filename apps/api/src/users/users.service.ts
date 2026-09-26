import { HttpStatus, Injectable } from '@nestjs/common'
import { hash } from '@node-rs/argon2'
import { isUUID } from 'class-validator'
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/audit.actions.js'
import { AuditService } from '../audit/audit.service.js'
import type { AuditContext } from '../audit/audit.types.js'
import { AuthService } from '../auth/auth.service.js'
import { ApiException } from '../common/api-exception.js'
import { Prisma } from '../generated/prisma/client.js'
import { UserRole } from '../generated/prisma/enums.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { CreateUserDto } from './dto/create-user.dto.js'
import type { ListUsersQueryDto } from './dto/list-users-query.dto.js'
import type { UpdateUserDto } from './dto/update-user.dto.js'
import type { UserListResponse, UserSummary } from './users.types.js'

/** The Argon2id options the authentication path verifies with. */
const ARGON2_ALGORITHM = 2

const USER_SUMMARY_SELECT = {
  id: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const

/**
 * Administrative user management for one company.
 *
 * Three rules shape it:
 *
 * 1. **The company is the boundary.** Every read and write scopes by the actor's company
 *    in the query itself, so a foreign or unknown user id is indistinguishable from a
 *    missing one and no resource existence leaks.
 * 2. **The last active Admin is protected under concurrency.** User administration locks
 *    the company's user rows `FOR UPDATE` before deciding, so two operations that would
 *    together remove the final active Admin serialize and the second is refused rather
 *    than both committing.
 * 3. **Authorization state is server-owned.** Role and activation live in PostgreSQL and
 *    are re-read on every protected request, so a change takes effect on the target's next
 *    request without touching their token. Deactivation additionally revokes the target's
 *    live sessions in the same transaction, so it cannot be waited out.
 *
 * The projection never carries a password hash, session id or token state.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async list(companyId: string, query: ListUsersQueryDto): Promise<UserListResponse> {
    this.ensureCompanyId(companyId)
    const where = { companyId }
    const offset = (query.page - 1) * query.pageSize

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: query.pageSize,
        select: USER_SUMMARY_SELECT,
      }),
    ])

    return {
      items: rows.map((row) => this.toSummary(row)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    }
  }

  /**
   * Creates an active user in the actor's company.
   *
   * The client supplies an email, a role and an initial password; the server owns the
   * company, the id, the timestamps and the hash. The credential is hashed with the same
   * Argon2id settings the login path verifies with, and the plaintext is never stored,
   * logged, audited or returned.
   */
  async create(context: AuditContext, input: CreateUserDto): Promise<UserSummary> {
    this.ensureCompanyId(context.companyId)
    const normalizedEmail = this.auth.normalizeEmail(input.email)
    const passwordHash = await hash(input.password, { algorithm: ARGON2_ALGORITHM })

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await this.lockCompanyUsers(tx, context.companyId)

        const user = await tx.user.create({
          data: {
            companyId: context.companyId,
            email: input.email.trim(),
            normalizedEmail,
            passwordHash,
            role: input.role,
            active: true,
          },
          select: USER_SUMMARY_SELECT,
        })

        await this.audit.record(tx, {
          actorId: context.actorId,
          entityType: AUDIT_ENTITY_TYPES.USER,
          entityId: user.id,
          action: AUDIT_ACTIONS.USER_CREATED,
          requestId: context.requestId,
          // The target id is the identity; the email is deliberately not duplicated here.
          safeMetadata: { roleAfter: user.role, activeAfter: true },
        })

        return user
      })

      return this.toSummary(created)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'USER_EMAIL_CONFLICT',
          'A user with that email already exists.',
        )
      }
      throw error
    }
  }

  /**
   * Changes a user's role and/or activation state.
   *
   * A change that would leave the company with no active Admin is refused with a
   * controlled conflict. Deactivation revokes the target's still-active sessions in the
   * same transaction, and each real change writes its own audit row — a request that
   * changes nothing writes none.
   */
  async update(context: AuditContext, userId: string, input: UpdateUserDto): Promise<UserSummary> {
    this.ensureCompanyId(context.companyId)
    if (!isUUID(userId)) {
      throw this.userNotFound()
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockCompanyUsers(tx, context.companyId)

      const target = await tx.user.findFirst({
        where: { id: userId, companyId: context.companyId },
        select: { id: true, role: true, active: true },
      })
      if (target === null) {
        throw this.userNotFound()
      }

      const nextRole = input.role ?? target.role
      const nextActive = input.active ?? target.active
      const roleChanged = nextRole !== target.role
      const activeChanged = nextActive !== target.active

      if (!roleChanged && !activeChanged) {
        // A no-op is not a mutation, so it records nothing.
        const current = await tx.user.findUniqueOrThrow({
          where: { id: target.id },
          select: USER_SUMMARY_SELECT,
        })
        return current
      }

      const losesAdmin =
        target.role === UserRole.ADMIN &&
        target.active &&
        (nextRole !== UserRole.ADMIN || nextActive === false)
      if (losesAdmin) {
        const remainingActiveAdmins = await tx.user.count({
          where: {
            companyId: context.companyId,
            role: UserRole.ADMIN,
            active: true,
            id: { not: target.id },
          },
        })
        if (remainingActiveAdmins === 0) {
          throw new ApiException(
            HttpStatus.CONFLICT,
            'LAST_ADMIN_PROTECTED',
            'The last active administrator cannot be removed or disabled.',
          )
        }
      }

      const user = await tx.user.update({
        where: { id: target.id },
        data: { role: nextRole, active: nextActive },
        select: USER_SUMMARY_SELECT,
      })

      if (roleChanged) {
        await this.audit.record(tx, {
          actorId: context.actorId,
          entityType: AUDIT_ENTITY_TYPES.USER,
          entityId: user.id,
          action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
          requestId: context.requestId,
          safeMetadata: { roleBefore: target.role, roleAfter: nextRole },
        })
      }

      if (activeChanged) {
        if (nextActive) {
          await this.audit.record(tx, {
            actorId: context.actorId,
            entityType: AUDIT_ENTITY_TYPES.USER,
            entityId: user.id,
            action: AUDIT_ACTIONS.USER_ACTIVATED,
            requestId: context.requestId,
            safeMetadata: { activeBefore: false, activeAfter: true },
          })
        } else {
          // Revocation commits in the same transaction as the disable, so no session that
          // already exists survives it. A login that passed its own active check
          // concurrently can still insert a session afterwards; that session is inert while
          // the account is inactive and cannot be used until an explicit reactivation.
          const revoked = await tx.authSession.updateMany({
            where: { userId: user.id, revokedAt: null },
            data: { revokedAt: new Date() },
          })
          await this.audit.record(tx, {
            actorId: context.actorId,
            entityType: AUDIT_ENTITY_TYPES.USER,
            entityId: user.id,
            action: AUDIT_ACTIONS.USER_DEACTIVATED,
            requestId: context.requestId,
            safeMetadata: {
              activeBefore: true,
              activeAfter: false,
              revokedSessionCount: revoked.count,
            },
          })
        }
      }

      return user
    })

    return this.toSummary(updated)
  }

  /**
   * Serializes user administration for one company.
   *
   * Every administrative write takes this lock before it reads or decides, in one
   * statement and in a deterministic order. That is what makes the last-Admin rule
   * concurrency-safe: two removals that would together empty the active Admin set cannot
   * interleave, because the second waits here and then decides against the committed
   * state. Taking the lock first, before any row is held, also means two transactions
   * cannot deadlock against each other.
   */
  private async lockCompanyUsers(tx: Prisma.TransactionClient, companyId: string): Promise<void> {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "User"
      WHERE "companyId" = ${companyId}::uuid
      ORDER BY "id"
      FOR UPDATE
    `)
  }

  private toSummary(row: {
    id: string
    email: string
    role: UserRole
    active: boolean
    createdAt: Date
    updatedAt: Date
  }): UserSummary {
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private userNotFound(): ApiException {
    // One body for foreign, malformed and unknown ids, so the surface cannot be probed.
    return new ApiException(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'User not found.')
  }

  private ensureCompanyId(companyId: string): void {
    if (!isUUID(companyId)) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_ACCESS_TOKEN',
        'Invalid access token.',
      )
    }
  }
}
