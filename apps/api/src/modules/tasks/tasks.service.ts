// Tasks service — TASK-API-001..012 (PH-06).
//
// Central object policy (tasks.policy.ts): active tasks are team-wide visible;
// archived tasks are admin-only (members get 404, BOLA-safe) and immutable;
// members may EDIT only tasks they created or are assigned to (BR-013), admins
// any (BR-014); archive is admin-only (BR-015).
//
// Every mutation runs inside a single interactive $transaction callback
// (Prisma 7 — the array form is unsupported, AP-20): resolve -> authorize ->
// optimistic-lock CAS (ADR-004: updateMany WHERE id AND version=expected,
// count 0 -> 409 STALE_VERSION with the current safe state) -> business-rule
// validation -> update -> history event. Authorization, mutation and history
// commit or roll back atomically (TASK-API-008): a history write failure
// undoes the mutation, never a partial write.
//
// History events are written ONLY for fields that actually changed
// (TASK-API-003), with oldValue/newValue JSON-serialized (D-7/D-9). The event
// set is the closed Prisma TaskChangeEvent enum — description and
// blockedReason edits have no event type and are therefore not audited.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import {
  Prisma,
  type TaskChangeEvent,
  type TaskStatus,
} from '../../../../../packages/api-contract/src/generated/prisma/client'
import type { AuthUser } from '../auth/auth.types'
import { CustomLogger } from '../../common/logger/custom.logger'
import { PrismaService } from '../../database/prisma.service'
import { ClientsService } from '../clients/clients.service'
import type { ArchiveTaskDto } from './dto/archive-task.dto'
import type { ChangeTaskStatusDto } from './dto/change-task-status.dto'
import type { CreateTaskDto } from './dto/create-task.dto'
import type { TaskQueryDto } from './dto/task-query.dto'
import type { BoardResponse, PageMeta, TaskChangeResponse, TaskDetailResponse, TaskResponse, TaskSummary } from './dto/task-response.dto'
import type { UpdateTaskDto } from './dto/update-task.dto'
import { toDateOnly, toTaskChange, toTaskResponse, toTaskSummary, type ChangeWithActor, type TaskWithRefs } from './tasks.mapper'
import { toTaskComment } from '../comments/comments.mapper'
import { canArchiveTask, canEditTask, canViewTask } from './tasks.policy'

const TASK_NOT_FOUND = {
  code: 'TASK_NOT_FOUND',
  detail: 'The requested task does not exist or is not visible to you.',
}

const TASK_ARCHIVED = {
  code: 'TASK_ARCHIVED',
  detail: 'This task is archived and can no longer be modified.',
}

const FORBIDDEN_EDIT = {
  code: 'FORBIDDEN',
  detail: 'You do not have permission to modify this task.',
}

// Contractual board sort (DEC-035): priority desc, due date asc nulls last,
// updatedAt desc — deterministic server-side, no manual card order. The board
// never honors query sort/order (LIST-001): its order is contractual.
const TASK_SORT: Prisma.TaskOrderByWithRelationInput[] = [
  { priority: 'desc' },
  { dueDate: { sort: 'asc', nulls: 'last' } },
  { updatedAt: 'desc' },
]

// LIST-001 default list sort: newest first.
const DEFAULT_LIST_SORT: Prisma.TaskOrderByWithRelationInput[] = [{ createdAt: 'desc' }]

// Server-enforced board cap (TASK-API-009): total cards across backlog and
// columns never exceeds this bound.
const BOARD_CAP = 200

const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true } },
  client: { select: { id: true, companyName: true } },
  creator: { select: { id: true, name: true } },
  archiver: { select: { id: true, name: true } },
} as const satisfies Prisma.TaskInclude

/** JSON-serialized history value (D-7/D-9): '"uuid"' / '"date"' / 'null'. */
const ser = (value: unknown): string => JSON.stringify(value)

@Injectable()
export class TasksService {
  private readonly logger = new CustomLogger('TasksService')

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  /** TASK-API-010 — paginated active list (archived excluded, BR-016). */
  async findAll(query: TaskQueryDto, actor: AuthUser): Promise<{ data: TaskSummary[]; meta: PageMeta }> {
    void actor // team-wide view — the guard only enforces authentication
    const where = this.buildWhere(query)
    const [total, tasks] = await this.prisma.$transaction(async (tx) => {
      const [count, rows] = await Promise.all([
        tx.task.count({ where }),
        tx.task.findMany({
          where,
          include: TASK_INCLUDE,
          orderBy: this.buildOrderBy(query),
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ])
      return [count, rows] as const
    })
    return { data: tasks.map(toTaskSummary), meta: { page: query.page, limit: query.limit, total } }
  }

  /**
   * TASK-API-009 — board: separate backlog + the four active columns.
   *
   * One query with the contractual sort, split in memory: the global order is
   * exactly the per-column order restricted to that status, so the split is
   * deterministic. With a `status` filter only that column is populated.
   */
  async board(query: TaskQueryDto, actor: AuthUser): Promise<BoardResponse> {
    void actor // team-wide view — the guard only enforces authentication
    const where = this.buildWhere(query)
    const tasks = await this.prisma.task.findMany({
      where,
      include: TASK_INCLUDE,
      orderBy: TASK_SORT,
      take: BOARD_CAP,
    })
    const summaries = tasks.map(toTaskSummary)
    const empty = { PENDING: [], IN_PROGRESS: [], BLOCKED: [], COMPLETED: [] }
    const board: BoardResponse['data'] =
      query.status !== undefined
        ? // Single-column filter: only that group is populated.
          query.status === 'BACKLOG'
          ? { backlog: summaries, columns: empty }
          : { backlog: [], columns: { ...empty, [query.status]: summaries } }
        : {
            backlog: summaries.filter((t) => t.status === 'BACKLOG'),
            columns: {
              PENDING: summaries.filter((t) => t.status === 'PENDING'),
              IN_PROGRESS: summaries.filter((t) => t.status === 'IN_PROGRESS'),
              BLOCKED: summaries.filter((t) => t.status === 'BLOCKED'),
              COMPLETED: summaries.filter((t) => t.status === 'COMPLETED'),
            },
          }
    return { data: board, meta: { total: summaries.length } }
  }

  /** TASK-API-010 — admin-only archived view (controller @Roles). */
  async archived(query: TaskQueryDto, actor: AuthUser): Promise<{ data: TaskResponse[]; meta: PageMeta }> {
    void actor
    const where = this.buildWhere(query, { archived: true })
    const [total, tasks] = await this.prisma.$transaction(async (tx) => {
      const [count, rows] = await Promise.all([
        tx.task.count({ where }),
        tx.task.findMany({
          where,
          include: TASK_INCLUDE,
          orderBy: this.buildOrderBy(query),
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ])
      return [count, rows] as const
    })
    return { data: tasks.map(toTaskResponse), meta: { page: query.page, limit: query.limit, total } }
  }

  /**
   * TASK-API-010 — detail (archived: admin only, member 404 BOLA-safe).
   *
   * PC-03 (COMM-001): the detail carries the task's last 5 comments, newest
   * first, from a separate query inside the same transaction (never a nested
   * include — the thread list endpoint owns the full paginated shape).
   */
  async findOne(id: string, actor: AuthUser): Promise<TaskDetailResponse> {
    const [task, comments] = await this.prisma.$transaction([
      this.prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE }),
      this.prisma.comment.findMany({
        where: { taskId: id },
        include: { author: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
    ])
    if (!task || !canViewTask(actor, task)) {
      throw new NotFoundException(TASK_NOT_FOUND)
    }
    return { ...toTaskResponse(task), comments: comments.map(toTaskComment) }
  }

  /**
   * TASK-API-007 — append-only history timeline, createdAt ASC.
   *
   * Member scope = viewable tasks (team-wide for active; archived admin-only,
   * member 404). The version of each entry is derived (D-5): CREATED is 1 and
   * every later event in timeline order is the post-mutation version 2..N.
   */
  async history(id: string, query: TaskQueryDto, actor: AuthUser): Promise<{ data: TaskChangeResponse[]; meta: PageMeta }> {
    const task = await this.prisma.task.findUnique({
      where: { id },
      select: { id: true, archivedAt: true, creatorId: true, assigneeId: true },
    })
    if (!task || !canViewTask(actor, task)) {
      throw new NotFoundException(TASK_NOT_FOUND)
    }
    const where = { taskId: id }
    const [total, changes] = await this.prisma.$transaction(async (tx) => {
      const [count, rows] = await Promise.all([
        tx.taskChange.count({ where }),
        tx.taskChange.findMany({
          where,
          include: { actor: { select: { id: true, name: true } } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ])
      return [count, rows] as const
    })
    return {
      data: changes.map((change, index) => toTaskChange(change as ChangeWithActor, (query.page - 1) * query.limit + index)),
      meta: { page: query.page, limit: query.limit, total },
    }
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  /**
   * TASK-API-002 — create (any active user). Atomic Task + CREATED history
   * event (BR-017/018); version starts at 1. Backlog may be unassigned
   * (BR-008); an active task without assignee is 422 (BR-009); BLOCKED
   * requires a reason (BR-010); INACTIVE assignees and ARCHIVED clients are
   * rejected (BR-004, FR-CLI-006 via ClientsService.assertAssignable).
   */
  async create(dto: CreateTaskDto, actor: AuthUser): Promise<TaskResponse> {
    if (dto.expectedVersion !== undefined && dto.expectedVersion !== 0) {
      // DTO already constrains to 0 — defensive only.
      throw new BadRequestException({ code: 'VALIDATION_ERROR', detail: 'expectedVersion must be 0 when creating a task.' })
    }
    const status: TaskStatus = dto.status ?? 'BACKLOG'
    const priority = dto.priority ?? 'MEDIUM'
    const assigneeId = dto.assigneeId ?? null
    // BR-009: only backlog tasks may exist without an assignee.
    if (status !== 'BACKLOG' && assigneeId === null) {
      throw this.unprocessable('ASSIGNEE_REQUIRED', 'assigneeId', 'Tasks outside the backlog must have an active assignee.')
    }
    const blockedReason = this.normalizeBlockedReason(status, dto.blockedReason ?? null)

    // CLI-API-006: archived-client associations are rejected (soft invariant,
    // checked pre-transaction — ClientsService is bound to the app client).
    await this.clientsService.assertAssignable(dto.clientId ?? null)

    const now = new Date()
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveAssignee(assigneeId, tx)
      const task = await tx.task.create({
        data: {
          title: dto.title,
          description: dto.description ?? null,
          status,
          priority,
          assigneeId,
          clientId: dto.clientId ?? null,
          dueDate: dto.dueDate ?? null,
          blockedReason,
          creatorId: actor.id,
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
        include: TASK_INCLUDE,
      })
      await tx.taskChange.create({
        data: { taskId: task.id, actorId: actor.id, event: 'CREATED', field: null, oldValue: null, newValue: null, createdAt: now },
      })
      this.logger.log('tasks.create', { event: 'tasks.create', taskId: task.id, actorId: actor.id, status })
      return toTaskResponse(task)
    })
  }

  /**
   * TASK-API-003 — field-level allowlist update (status is owned by the
   * dedicated endpoint). Only fields that actually changed produce a history
   * event (compare old vs new); `assigneeId: null` unassigns — allowed only in
   * BACKLOG (BR-009); `blockedReason` is only accepted while BLOCKED (BR-011).
   */
  async update(id: string, dto: UpdateTaskDto, actor: AuthUser): Promise<TaskResponse> {
    const editable = [dto.title, dto.description, dto.priority, dto.assigneeId, dto.clientId, dto.dueDate, dto.blockedReason]
    if (editable.every((value) => value === undefined)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        detail: 'At least one editable field (title, description, priority, assigneeId, clientId, dueDate or blockedReason) must be provided.',
      })
    }
    if (dto.clientId !== undefined) {
      await this.clientsService.assertAssignable(dto.clientId)
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await this.resolveTask(tx, id)
      if (!task) throw new NotFoundException(TASK_NOT_FOUND)
      this.assertCanEdit(task, actor) // 404 member / 409 TASK_ARCHIVED admin / 403 unrelated
      this.assertVersion(task, dto.expectedVersion)

      // Resolve the assignee BEFORE the CAS so 404/422 never races the lock.
      let assigneeId = task.assigneeId
      if (dto.assigneeId !== undefined) {
        if (dto.assigneeId === null) {
          if (task.status !== 'BACKLOG') throw this.unprocessable('ASSIGNEE_REQUIRED', 'assigneeId', 'Active tasks cannot be unassigned.')
          assigneeId = null
        } else {
          await this.assertActiveAssignee(dto.assigneeId, tx)
          assigneeId = dto.assigneeId
        }
      }

      // blockedReason rule (BR-011): only accepted while BLOCKED; the DB CHECK
      // Task_blocked_reason_cleared rejects a reason on a non-BLOCKED row.
      let blockedReason = task.blockedReason
      if (dto.blockedReason !== undefined) {
        if (task.status !== 'BLOCKED' && dto.blockedReason !== null) {
          throw this.unprocessable('BLOCKED_REASON_REQUIRED', 'blockedReason', 'A blocked reason is only accepted while the task is BLOCKED.')
        }
        blockedReason = dto.blockedReason
      }
      if (task.status === 'BLOCKED' && (blockedReason === null || blockedReason.trim().length === 0)) {
        throw this.unprocessable('BLOCKED_REASON_REQUIRED', 'blockedReason', 'A blocked task requires a non-empty reason.')
      }

      const data: Prisma.TaskUpdateManyMutationInput = {
        version: { increment: 1 },
        updatedAt: new Date(),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(assigneeId !== task.assigneeId ? { assigneeId } : {}),
        ...(dto.clientId !== undefined ? { clientId: dto.clientId } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate } : {}),
        ...(blockedReason !== task.blockedReason ? { blockedReason } : {}),
      }

      // ADR-004 compare-and-swap: count 0 -> the row moved since our read.
      const cas = await tx.task.updateMany({ where: { id, version: dto.expectedVersion }, data })
      if (cas.count === 0) {
        throw this.staleVersion(task)
      }

      const events = this.changedEvents(task, dto, assigneeId)
      for (const change of events) {
        await tx.taskChange.create({
          data: {
            taskId: id,
            actorId: actor.id,
            event: change.event,
            field: eventField(change.event),
            oldValue: change.oldValue,
            newValue: change.newValue,
            createdAt: new Date(),
          },
        })
      }

      const updated = await tx.task.findUniqueOrThrow({ where: { id }, include: TASK_INCLUDE })
      this.logger.log('tasks.update', { event: 'tasks.update', taskId: id, actorId: actor.id, events: events.map((e) => e.event) })
      return toTaskResponse(updated)
    })
  }

  /**
   * TASK-API-004 — status transitions (free, DEC-024). Entering BLOCKED
   * requires a non-empty reason (BR-010); leaving BLOCKED clears the active
   * reason while the old value stays in history (BR-011); COMPLETED -> active
   * is a reopen with a REOPENED event (BR-012). A same-status PATCH is a
   * no-op: no version bump, no event (DEC-035 same-column drop).
   */
  async changeStatus(id: string, dto: ChangeTaskStatusDto, actor: AuthUser): Promise<TaskResponse> {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.resolveTask(tx, id)
      if (!task) throw new NotFoundException(TASK_NOT_FOUND)
      this.assertCanEdit(task, actor) // 404 member / 409 TASK_ARCHIVED admin / 403 unrelated
      this.assertVersion(task, dto.expectedVersion)

      if (dto.status === task.status) {
        return toTaskResponse(task) // no-op (DEC-035): nothing written
      }

      // BR-009: any non-backlog status requires an assignee.
      if (dto.status !== 'BACKLOG' && !task.assigneeId) {
        throw this.unprocessable('ASSIGNEE_REQUIRED', 'assigneeId', 'Tasks outside the backlog must have an active assignee.')
      }
      // BR-010: entering BLOCKED requires a non-empty reason; BR-011: leaving
      // BLOCKED clears the active reason.
      const trimmedReason = dto.blockedReason?.trim() ?? ''
      const blockedReason = dto.status === 'BLOCKED' ? trimmedReason : null
      if (dto.status === 'BLOCKED' && trimmedReason.length === 0) {
        throw this.unprocessable('BLOCKED_REASON_REQUIRED', 'blockedReason', 'A blocked task requires a non-empty reason.')
      }

      const cas = await tx.task.updateMany({
        where: { id, version: dto.expectedVersion },
        data: { status: dto.status, blockedReason, version: { increment: 1 }, updatedAt: new Date() },
      })
      if (cas.count === 0) {
        throw this.staleVersion(task)
      }

      // BR-012: reopening a COMPLETED task emits REOPENED; otherwise STATUS_CHANGED.
      const event: TaskChangeEvent = task.status === 'COMPLETED' ? 'REOPENED' : 'STATUS_CHANGED'
      await tx.taskChange.create({
        data: {
          taskId: id,
          actorId: actor.id,
          event,
          field: 'status',
          oldValue: ser(task.status),
          newValue: ser(dto.status),
          createdAt: new Date(),
        },
      })

      const updated = await tx.task.findUniqueOrThrow({ where: { id }, include: TASK_INCLUDE })
      this.logger.log('tasks.changeStatus', {
        event: 'tasks.changeStatus',
        taskId: id,
        actorId: actor.id,
        from: task.status,
        to: dto.status,
      })
      return toTaskResponse(updated)
    })
  }

  /**
   * TASK-API-006 — archive (admin only, BR-015). Records the archiver and an
   * ARCHIVED event; the task is immutable afterwards (BR-016). A double
   * archive is a 409 TASK_ARCHIVED no-op with no second event.
   */
  async archive(id: string, dto: ArchiveTaskDto, actor: AuthUser): Promise<TaskResponse> {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.resolveTask(tx, id)
      if (!task) throw new NotFoundException(TASK_NOT_FOUND)
      if (!canArchiveTask(actor, task)) {
        if (task.archivedAt) {
          throw new ConflictException({ ...TASK_ARCHIVED, detail: 'This task is already archived.' })
        }
        throw new ForbiddenException(FORBIDDEN_EDIT)
      }
      this.assertVersion(task, dto.expectedVersion)

      const cas = await tx.task.updateMany({
        where: { id, version: dto.expectedVersion },
        data: { archivedAt: new Date(), archivedById: actor.id, version: { increment: 1 }, updatedAt: new Date() },
      })
      if (cas.count === 0) {
        throw this.staleVersion(task)
      }
      await tx.taskChange.create({
        data: { taskId: id, actorId: actor.id, event: 'ARCHIVED', field: null, oldValue: null, newValue: null, createdAt: new Date() },
      })

      const updated = await tx.task.findUniqueOrThrow({ where: { id }, include: TASK_INCLUDE })
      this.logger.log('tasks.archive', { event: 'tasks.archive', taskId: id, actorId: actor.id })
      return toTaskResponse(updated)
    })
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * LIST-001 (PC-02) — allowlisted list sort. All allowed fields are direct
   * Task columns, so the Prisma orderBy is a plain `{ [field]: direction }`.
   * Unknown values never reach here (DTO @IsIn rejects them with 400); a
   * missing sort falls back to createdAt desc. Without an explicit order,
   * priority defaults to desc (its natural reading), everything else asc.
   */
  private buildOrderBy(query: TaskQueryDto): Prisma.TaskOrderByWithRelationInput[] {
    const field = query.sort
    if (!field) return DEFAULT_LIST_SORT
    const direction: Prisma.SortOrder = query.order ?? (field === 'priority' ? 'desc' : 'asc')
    return [{ [field]: direction }]
  }

  private buildWhere(query: TaskQueryDto, opts: { archived?: boolean } = {}): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = opts.archived ? { archivedAt: { not: null } } : { archivedAt: null }
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    if (query.status) where.status = query.status
    if (query.priority) where.priority = query.priority
    if (query.assigneeId) where.assigneeId = query.assigneeId
    if (query.clientId) where.clientId = query.clientId
    if (query.dueBefore || query.dueAfter) {
      where.dueDate = {
        ...(query.dueBefore !== undefined ? { lte: query.dueBefore } : {}),
        ...(query.dueAfter !== undefined ? { gte: query.dueAfter } : {}),
      }
    }
    return where
  }

  private async resolveTask(db: Prisma.TransactionClient | PrismaService, id: string): Promise<TaskWithRefs | null> {
    return db.task.findUnique({ where: { id }, include: TASK_INCLUDE })
  }

  /**
   * BR-004: assignees must be ACTIVE users. Unknown ids are 404 USER_NOT_FOUND
   * (same shape as the assignee reference errors in the OpenAPI contract).
   */
  private async assertActiveAssignee(assigneeId: string | null, tx: Prisma.TransactionClient): Promise<void> {
    if (!assigneeId) return
    const user = await tx.user.findUnique({ where: { id: assigneeId }, select: { id: true, status: true } })
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', detail: 'The requested assignee does not exist.' })
    }
    if (user.status !== 'ACTIVE') {
      throw this.unprocessable('INACTIVE_ASSIGNEE', 'assigneeId', 'The selected assignee is inactive and cannot receive assignments.')
    }
  }

  /**
   * Authorization inside the transaction (TASK-API-008). Archived tasks are
   * immutable: an admin gets 409 TASK_ARCHIVED, a member gets the same 404 as
   * an unknown id (BOLA-safe, BR-016) — members never learn the task exists.
   */
  private assertCanEdit(task: TaskWithRefs, actor: AuthUser): void {
    if (task.archivedAt) {
      if (actor.role !== 'ADMIN') throw new NotFoundException(TASK_NOT_FOUND)
      throw new ConflictException(TASK_ARCHIVED)
    }
    if (!canEditTask(actor, task)) {
      throw new ForbiddenException(FORBIDDEN_EDIT)
    }
  }

  /** ADR-004 / DEC-034: expectedVersion must match the current row version. */
  private assertVersion(task: TaskWithRefs, expectedVersion: number): void {
    if (task.version !== expectedVersion) {
      throw this.staleVersion(task)
    }
  }

  /** 409 STALE_VERSION with the current safe state (openapi-and-errors.md §3.6). */
  private staleVersion(task: TaskWithRefs): ConflictException {
    return new ConflictException({
      code: 'STALE_VERSION',
      detail: 'This task was modified by someone else. Review the current state and retry.',
      currentVersion: task.version,
      currentState: {
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assigneeId: task.assigneeId,
        clientId: task.clientId,
        dueDate: task.dueDate ? toDateOnly(task.dueDate) : null,
        blockedReason: task.blockedReason,
        archivedAt: task.archivedAt ? task.archivedAt.toISOString() : null,
      },
    })
  }

  private unprocessable(code: string, field: string, message: string): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code,
      detail: message,
      errors: [{ field, message, code }],
    })
  }

  /** BR-010/BR-011: a reason is persisted only while BLOCKED, and never blank. */
  private normalizeBlockedReason(status: TaskStatus, reason: string | null): string | null {
    if (status === 'BLOCKED') {
      const trimmed = reason?.trim() ?? ''
      if (trimmed.length === 0) {
        throw this.unprocessable('BLOCKED_REASON_REQUIRED', 'blockedReason', 'A blocked task requires a non-empty reason.')
      }
      return trimmed
    }
    if (reason !== null && reason !== undefined) {
      throw this.unprocessable('BLOCKED_REASON_REQUIRED', 'blockedReason', 'A blocked reason is only accepted while the task is BLOCKED.')
    }
    return null
  }

  /**
   * TASK-API-003 — history events only for fields that actually changed.
   * Serialization follows D-7/D-9 (JSON strings); due dates are compared as
   * 'YYYY-MM-DD' so a same-day write is not an auditable change.
   */
  private changedEvents(
    task: TaskWithRefs,
    dto: UpdateTaskDto,
    assigneeId: string | null,
  ): Array<{ event: TaskChangeEvent; field?: string; oldValue: string; newValue: string }> {
    const events: Array<{ event: TaskChangeEvent; field?: string; oldValue: string; newValue: string }> = []
    if (dto.title !== undefined && dto.title !== task.title) {
      events.push({ event: 'TITLE_CHANGED', field: 'title', oldValue: ser(task.title), newValue: ser(dto.title) })
    }
    if (dto.priority !== undefined && dto.priority !== task.priority) {
      events.push({ event: 'PRIORITY_CHANGED', field: 'priority', oldValue: ser(task.priority), newValue: ser(dto.priority) })
    }
    if (assigneeId !== task.assigneeId) {
      events.push({ event: 'ASSIGNEE_CHANGED', field: 'assigneeId', oldValue: ser(task.assigneeId), newValue: ser(assigneeId) })
    }
    if (dto.dueDate !== undefined && this.dueDateString(dto.dueDate) !== this.dueDateString(task.dueDate)) {
      events.push({
        event: 'DUE_DATE_CHANGED',
        field: 'dueDate',
        oldValue: ser(this.dueDateString(task.dueDate)),
        newValue: ser(this.dueDateString(dto.dueDate)),
      })
    }
    return events
  }

  private dueDateString(date: Date | null): string | null {
    return date ? toDateOnly(date) : null
  }
}

function eventField(event: TaskChangeEvent): string | null {
  switch (event) {
    case 'TITLE_CHANGED':
      return 'title'
    case 'PRIORITY_CHANGED':
      return 'priority'
    case 'ASSIGNEE_CHANGED':
      return 'assigneeId'
    case 'DUE_DATE_CHANGED':
      return 'dueDate'
    case 'STATUS_CHANGED':
    case 'REOPENED':
      return 'status'
    default:
      return null
  }
}
