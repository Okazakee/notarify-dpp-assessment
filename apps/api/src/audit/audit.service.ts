import { Injectable } from '@nestjs/common'
import type { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { AuditLogListResponse, AuditRecordInput } from './audit.types.js'
import type { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto.js'

/**
 * The application's append-only audit surface.
 *
 * Two rules define it:
 *
 * 1. **Writes are transactional.** `record` takes the caller's transaction client, so the
 *    audited mutation and its audit row commit or roll back together. There is no
 *    "commit, then try to log" path for the mutations this milestone covers: an audit
 *    insert that fails rolls the mutation back instead of leaving it unrecorded.
 * 2. **Reads are company-scoped and Admin-only.** Scoping runs through the actor's
 *    company relationship in the query itself, so another company's events cannot be
 *    reached even with a valid id, and the role check happens in the guard chain before
 *    this service is called.
 *
 * There is no update or delete surface, and the application never edits a recorded row.
 * That is append-only behaviour through the application — it is deliberately **not**
 * described as cryptographic tamper-proofing, which this design does not provide.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends one audit row inside the caller's transaction.
   *
   * Callers pass only bounded, safe metadata: no password, no hash, no token, no cookie,
   * no request body and no binary content. The metadata vocabulary is documented in
   * `audit.actions.ts` rather than left to each call site.
   */
  async record(tx: Prisma.TransactionClient, input: AuditRecordInput): Promise<void> {
    await tx.auditEvent.create({
      data: {
        actorId: input.actorId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        requestId: input.requestId,
        safeMetadata: input.safeMetadata ?? undefined,
      },
    })
  }

  /**
   * The bounded, newest-first audit page for the actor's company.
   *
   * The tie-break on `id` keeps the order deterministic when two rows share a timestamp,
   * so paging cannot repeat or skip an entry.
   */
  async list(companyId: string, query: ListAuditLogsQueryDto): Promise<AuditLogListResponse> {
    const where: Prisma.AuditEventWhereInput = { actor: { companyId } }
    const offset = (query.page - 1) * query.pageSize

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: query.pageSize,
        select: {
          id: true,
          occurredAt: true,
          action: true,
          entityType: true,
          entityId: true,
          requestId: true,
          safeMetadata: true,
          actor: { select: { id: true, email: true, role: true } },
        },
      }),
    ])

    return {
      items: rows.map((row) => ({
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        requestId: row.requestId,
        safeMetadata: row.safeMetadata,
        actor: row.actor,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    }
  }
}
