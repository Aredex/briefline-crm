// Clients service — CLI-API-001..006 (PH-05), CHIST-001 (PC-06).
//
// Permission model (permission-matrix.md rows 13-18, BR-005/006):
//   - Team-wide view of non-archived clients for every authenticated user.
//   - ARCHIVED clients are invisible to members (404 on resolve — BOLA-safe)
//     and excluded from their lists; admins can list/filter them.
//   - Create: any active user (creator recorded). Update/deactivate/archive:
//     ADMIN only (controller-level @Roles). Writes to an ARCHIVED client -> 409.
//   - CLI-API-006: an archived client rejects NEW task associations (422
//     CANNOT_ASSIGN_ARCHIVED_CLIENT); existing links remain intact. The
//     assertAssignable() helper is the enforcement point PH-06 tasks will call.
//
// CHIST-001 (PC-06): every mutation writes an append-only ClientChange entry
// (CREATED / FIELD_CHANGED / STATUS_CHANGED / ARCHIVED) inside the SAME
// interactive $transaction as the mutation — a history write failure undoes
// the mutation, never a partial write (same atomicity guarantee as
// TASK-API-008). FIELD_CHANGED entries are written ONLY for fields that
// actually changed (same-value PATCH is a silent no-op, DEC-035 spirit).
// Reads are never audited. The history endpoint follows the task view
// policy: ARCHIVED clients are member-404 (BOLA-safe).
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { Prisma } from '../../generated/prisma/client'
import type { AuthUser } from '../auth/auth.types'
import { CustomLogger } from '../../common/logger/custom.logger'
import { PrismaService } from '../../database/prisma.service'
import type { ClientQueryDto } from './dto/client-query.dto'
import type { ClientChangeResponse, ClientResponse, ClientWithTasksResponse, PageMeta } from './dto/client-response.dto'
import { CreateClientDto } from './dto/create-client.dto'
import { UpdateClientDto } from './dto/update-client.dto'
import { toClientChange, toClientResponse, toTaskSummary } from './clients.mapper'
import { toContactResponse } from '../contacts/contacts.mapper'

const CLIENT_NOT_FOUND = {
  code: 'CLIENT_NOT_FOUND',
  detail: 'The requested client does not exist or is not visible to you.',
}

const CLIENT_ARCHIVED = {
  code: 'CLIENT_ARCHIVED',
  detail: 'This client is archived and can no longer be modified.',
}

// Allowlisted updatable fields — CHIST-001 audits exactly these (the DTO
// rejects anything else at the boundary, NFR-SEC-005).
const CHANGED_FIELDS = ['companyName', 'industry', 'contactName', 'contactEmail', 'phone', 'notes'] as const

/** JSON-serialized history value (D-7/D-9): '"uuid"' / '"text"' / 'null'. */
const ser = (value: unknown): string => JSON.stringify(value)

@Injectable()
export class ClientsService {
  private readonly logger = new CustomLogger('ClientsService')

  constructor(private readonly prisma: PrismaService) {}

  /** CLI-API-001 — paginated list with q/status filters (FR-CLI-001). */
  async findAll(
    query: ClientQueryDto,
    actor: AuthUser,
  ): Promise<{ data: ClientResponse[]; meta: PageMeta }> {
    const where = this.buildListWhere(query, actor)
    const [total, clients] = await this.prisma.$transaction([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        include: { creator: { select: { id: true, name: true } } },
        orderBy: { companyName: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ])
    return {
      data: clients.map(toClientResponse),
      meta: { page: query.page, limit: query.limit, total },
    }
  }

  /** CLI-API-002 — create by any active user; creator recorded (BR-006).
   *  CHIST-001: a CREATED audit entry is written atomically with the row. */
  async create(dto: CreateClientDto, actor: AuthUser): Promise<ClientResponse> {
    const now = new Date()
    const client = await this.prisma.$transaction(async (tx) => {
      const row = await tx.client.create({
        data: {
          companyName: dto.companyName,
          industry: dto.industry ?? null,
          contactName: dto.contactName,
          contactEmail: dto.contactEmail, // normalized by the DTO (ADR-002, D-16)
          phone: dto.phone ?? null,
          notes: dto.notes ?? null,
          createdById: actor.id,
          status: 'ACTIVE', // initial status (D-8)
          createdAt: now,
          updatedAt: now,
        },
        include: { creator: { select: { id: true, name: true } } },
      })
      await tx.clientChange.create({
        data: { clientId: row.id, actorId: actor.id, event: 'CREATED', field: null, oldValue: null, newValue: null, createdAt: now },
      })
      return row
    })
    this.logger.log('clients.create', { event: 'clients.create', clientId: client.id, actorId: actor.id })
    return toClientResponse(client)
  }

  /**
   * CLI-API-003 — client detail with a paginated related-task summary (FR-CLI-005),
   * the client's contact list, primary first (PC-01, PH-14) and the last 5
   * audit events, newest first (PC-06, CHIST-001).
   *
   * No N+1: the client row is a single findUnique, and the detail is four
   * queries (task count + task page + contacts + last-5 changes) with the
   * join data included. Archived tasks are excluded (BR-016: archived
   * resources are out of every active view). BOLA-safe: a member resolving an
   * ARCHIVED client gets 404, identical to an unknown id (BR-005).
   */
  async findOne(id: string, query: ClientQueryDto, actor: AuthUser): Promise<ClientWithTasksResponse> {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { creator: { select: { id: true, name: true } } },
    })
    if (!client) {
      throw new NotFoundException(CLIENT_NOT_FOUND)
    }
    if (client.status === 'ARCHIVED' && actor.role !== 'ADMIN') {
      throw new NotFoundException(CLIENT_NOT_FOUND)
    }

    const [total, tasks, contacts, history] = await this.prisma.$transaction([
      this.prisma.task.count({ where: { clientId: id, archivedAt: null } }),
      this.prisma.task.findMany({
        where: { clientId: id, archivedAt: null },
        include: {
          assignee: { select: { id: true, name: true } },
          client: { select: { id: true, companyName: true } },
          labels: { select: { label: { select: { id: true, name: true, color: true } } } }, // LAB-002 (PC-04)
        },
        // Contractual sort (DEC-035): priority desc, due date asc nulls last, updatedAt desc.
        orderBy: [{ priority: 'desc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      // PC-01 (PH-14): the client's full contact list, primary first
      // (not paginated — a client holds a handful of contacts; the detail
      // view is the master record for them).
      this.prisma.contact.findMany({
        where: { clientId: id },
        include: { client: { select: { id: true, companyName: true } } },
        orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
      }),
      // PC-06 (CHIST-001): last 5 audit events, newest first (same spirit as
      // the task detail's last-5 comments, COMM-001).
      this.prisma.clientChange.findMany({
        where: { clientId: id },
        include: { actor: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
    ])

    return {
      client: toClientResponse(client),
      relatedTasks: {
        data: tasks.map(toTaskSummary),
        meta: { page: query.page, limit: query.limit, total },
      },
      contacts: contacts.map(toContactResponse),
      history: history.map(toClientChange),
    }
  }

  /**
   * CLI-API-004 — admin-only field update (controller @Roles).
   * CHIST-001: one FIELD_CHANGED event per field that actually changed,
   * written atomically with the update. A same-value PATCH is a no-op: the
   * row is rewritten but no event is produced (DEC-035 same-column drop).
   */
  async update(id: string, dto: UpdateClientDto, actor: AuthUser): Promise<ClientResponse> {
    // class-transformer exposes unset class props as undefined keys (v0.5+),
    // so an empty body `{}` arrives with 6 keys, all undefined — checking key
    // count would let it through as a silent no-op update.
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        detail: 'At least one field (companyName, industry, contactName, contactEmail, phone or notes) must be provided.',
      })
    }
    const now = new Date()
    return this.prisma.$transaction(async (tx) => {
      const client = await this.resolveForWrite(tx, id) // 404 unknown / 409 archived
      const events = CHANGED_FIELDS.filter((field) => {
        const value = dto[field]
        return value !== undefined && value !== client[field]
      })
      const updated = await tx.client.update({
        where: { id },
        data: {
          ...(dto.companyName !== undefined ? { companyName: dto.companyName } : {}),
          ...(dto.industry !== undefined ? { industry: dto.industry } : {}),
          ...(dto.contactName !== undefined ? { contactName: dto.contactName } : {}),
          ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          updatedAt: now,
        },
        include: { creator: { select: { id: true, name: true } } },
      })
      if (events.length > 0) {
        await tx.clientChange.createMany({
          data: events.map((field) => ({
            clientId: id,
            actorId: actor.id,
            event: 'FIELD_CHANGED',
            field,
            oldValue: ser(client[field]),
            newValue: ser(dto[field]),
            createdAt: now,
          })),
        })
      }
      this.logger.log('clients.update', { event: 'clients.update', clientId: id, changedFields: events })
      return toClientResponse(updated)
    })
  }

  /**
   * CLI-API-005 — admin-only deactivate; INACTIVE is a 200 no-op (matrix
   * row 17) with no audit event — nothing changed. CHIST-001: the transition
   * records a STATUS_CHANGED event atomically.
   */
  async deactivate(id: string, actor: AuthUser): Promise<ClientResponse> {
    const now = new Date()
    return this.prisma.$transaction(async (tx) => {
      const client = await this.resolveForWrite(tx, id)
      if (client.status === 'INACTIVE') {
        return toClientResponse(client) // no-op 200
      }
      const updated = await tx.client.update({
        where: { id },
        data: { status: 'INACTIVE', updatedAt: now },
        include: { creator: { select: { id: true, name: true } } },
      })
      await tx.clientChange.create({
        data: {
          clientId: id,
          actorId: actor.id,
          event: 'STATUS_CHANGED',
          field: 'status',
          oldValue: ser('ACTIVE'),
          newValue: ser('INACTIVE'),
          createdAt: now,
        },
      })
      this.logger.log('clients.deactivate', { event: 'clients.deactivate', clientId: id })
      return toClientResponse(updated)
    })
  }

  /**
   * CLI-API-005 — admin-only archive (BR-006). ACTIVE/INACTIVE -> ARCHIVED;
   * a double archive is a 409 with no state change (defined idempotency).
   * CHIST-001: the transition records an ARCHIVED event atomically.
   * Relationships are preserved — no physical delete.
   */
  async archive(id: string, actor: AuthUser): Promise<ClientResponse> {
    const now = new Date()
    return this.prisma.$transaction(async (tx) => {
      const client = await this.resolveForWrite(tx, id)
      if (client.status === 'ARCHIVED') {
        throw new ConflictException({ ...CLIENT_ARCHIVED, detail: 'This client is already archived.' })
      }
      const updated = await tx.client.update({
        where: { id },
        data: { status: 'ARCHIVED', updatedAt: now },
        include: { creator: { select: { id: true, name: true } } },
      })
      await tx.clientChange.create({
        data: {
          clientId: id,
          actorId: actor.id,
          event: 'ARCHIVED',
          field: null,
          oldValue: null,
          newValue: null,
          createdAt: now,
        },
      })
      this.logger.log('clients.archive', { event: 'clients.archive', clientId: id })
      return toClientResponse(updated)
    })
  }

  /**
   * CHIST-001 (PC-06) — append-only client audit timeline, createdAt DESC
   * (newest first), paginated. Access policy = the detail route's: a member
   * resolving an ARCHIVED client gets 404 (BOLA-safe), admins see everything.
   */
  async history(
    id: string,
    query: ClientQueryDto,
    actor: AuthUser,
  ): Promise<{ data: ClientChangeResponse[]; meta: PageMeta }> {
    const client = await this.prisma.client.findUnique({
      where: { id },
      select: { id: true, status: true },
    })
    if (!client || (client.status === 'ARCHIVED' && actor.role !== 'ADMIN')) {
      throw new NotFoundException(CLIENT_NOT_FOUND)
    }
    const where = { clientId: id }
    const [total, changes] = await this.prisma.$transaction([
      this.prisma.clientChange.count({ where }),
      this.prisma.clientChange.findMany({
        where,
        include: { actor: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ])
    return {
      data: changes.map(toClientChange),
      meta: { page: query.page, limit: query.limit, total },
    }
  }

  /**
   * CLI-API-006 — FR-CLI-006 association invariant (PH-06 tasks will call this
   * before persisting clientId on task create/update). An ARCHIVED client
   * rejects NEW task associations (422 CANNOT_ASSIGN_ARCHIVED_CLIENT); existing
   * links remain untouched. Unknown ids -> 404 CLIENT_NOT_FOUND. null/undefined
   * (task without a client) is a pass.
   */
  async assertAssignable(clientId: string | null | undefined): Promise<void> {
    if (!clientId) return
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, status: true },
    })
    if (!client) {
      throw new NotFoundException(CLIENT_NOT_FOUND)
    }
    if (client.status === 'ARCHIVED') {
      throw new UnprocessableEntityException({
        code: 'CANNOT_ASSIGN_ARCHIVED_CLIENT',
        detail: 'Archived clients cannot receive new task associations.',
        errors: [
          {
            field: 'clientId',
            message: 'Archived clients cannot receive new task associations.',
            code: 'CANNOT_ASSIGN_ARCHIVED_CLIENT',
          },
        ],
      })
    }
  }

  /**
   * BR-005/BR-006 list visibility: archived clients are excluded by default;
   * admins opt in with ?status=ARCHIVED. A member asking for ARCHIVED gets an
   * empty page (no 403, no archived rows — the matrix's "filter yields empty").
   */
  private buildListWhere(query: ClientQueryDto, actor: AuthUser): Prisma.ClientWhereInput {
    const where: Prisma.ClientWhereInput = {}
    if (query.q) {
      where.OR = [
        { companyName: { contains: query.q, mode: 'insensitive' } },
        { contactName: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    if (query.status) {
      where.AND = [{ status: query.status }]
      if (actor.role !== 'ADMIN') {
        where.AND.push({ status: { not: 'ARCHIVED' } })
      }
    } else if (actor.role !== 'ADMIN') {
      where.status = { not: 'ARCHIVED' }
    }
    return where
  }

  /** Resolve inside a transaction: 404 on unknown, 409 on archived (immutable). */
  private async resolveForWrite(db: Prisma.TransactionClient | PrismaService, id: string) {
    const client = await db.client.findUnique({
      where: { id },
      include: { creator: { select: { id: true, name: true } } },
    })
    if (!client) {
      throw new NotFoundException(CLIENT_NOT_FOUND)
    }
    if (client.status === 'ARCHIVED') {
      throw new ConflictException(CLIENT_ARCHIVED)
    }
    return client
  }
}
