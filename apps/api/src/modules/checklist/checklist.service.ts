// Checklist service — CHECK-001/002 (PC-05).
//
// Per-task checkbox list. Reads follow the TASK visibility rule
// (tasks.policy.canViewTask — a checklist is only reachable when the task
// itself is visible); mutations follow the TASK edit rule (canEditTask, same
// policy as task edits and label assignment, LAB-002): archived tasks are 404
// for members (identical to an unknown id — BOLA-safe, BR-016) and 409
// TASK_ARCHIVED for admins; unrelated members get 403, never a hint about the
// task's existence.
//
// Optimistic locking (ADR-004): toggle/content updates carry
// expectedVersion (required) and commit via compare-and-swap — a mismatch is
// 409 STALE_VERSION with the current safe state, never a lost update.
// sortOrder is server-assigned on create (append at max+1); reorder applies
// the client's full ordering atomically in ONE transaction and does NOT bump
// item versions (a reorder never invalidates an in-flight toggle).
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, type ChecklistItem } from '../../generated/prisma/client'
import type { AuthUser } from '../auth/auth.types'
import { CustomLogger } from '../../common/logger/custom.logger'
import { PrismaService } from '../../database/prisma.service'
import { canEditTask, canViewTask } from '../tasks/tasks.policy'
import type { CreateChecklistItemDto } from './dto/create-checklist-item.dto'
import type { UpdateChecklistItemDto } from './dto/update-checklist-item.dto'
import type { ReorderChecklistDto } from './dto/reorder-checklist.dto'
import type { ChecklistItemResponse } from './dto/checklist-item-response.dto'
import { toChecklistItemResponse } from './checklist.mapper'

// Same code/detail as TasksService/CommentsService/LabelsService: a checklist
// on a non-visible task is indistinguishable from one on an unknown task
// (BOLA-safe, BR-016).
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

const ITEM_NOT_FOUND = {
  code: 'CHECKLIST_ITEM_NOT_FOUND',
  detail: 'The requested checklist item does not exist.',
}

// Contractual checklist order: sortOrder ascending, id tiebreak.
const CHECKLIST_ORDER: Prisma.ChecklistItemOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { id: 'asc' },
]

/** Row subset every authorization branch needs (TaskRowLike from tasks.policy). */
interface TaskRow {
  id: string
  archivedAt: Date | null
  creatorId: string
  assigneeId: string | null
}

@Injectable()
export class ChecklistService {
  private readonly logger = new CustomLogger('ChecklistService')

  constructor(private readonly prisma: PrismaService) {}

  /** CHECK-001 — full checklist of a visible task, sortOrder ascending. */
  async findAll(taskId: string, actor: AuthUser): Promise<ChecklistItemResponse[]> {
    await this.assertTaskVisible(taskId, actor)
    const items = await this.prisma.checklistItem.findMany({
      where: { taskId },
      orderBy: CHECKLIST_ORDER,
    })
    return items.map(toChecklistItemResponse)
  }

  /**
   * CHECK-001 — append an item (same permission as editing the task).
   * sortOrder is server-assigned: max(sortOrder)+1, so the new item always
   * lands last (first item on an empty list gets 0). The visibility check and
   * the mutation commit atomically (TASK-API-008 spirit).
   */
  async create(taskId: string, dto: CreateChecklistItemDto, actor: AuthUser): Promise<ChecklistItemResponse> {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.resolveTask(tx, taskId)
      if (!task) throw new NotFoundException(TASK_NOT_FOUND)
      this.assertCanEdit(task, actor) // 404 member / 409 TASK_ARCHIVED admin / 403 unrelated

      const max = await tx.checklistItem.aggregate({
        where: { taskId },
        _max: { sortOrder: true },
      })
      const item = await tx.checklistItem.create({
        data: { taskId, content: dto.content, sortOrder: (max._max.sortOrder ?? -1) + 1 },
      })
      this.logger.log('checklist.create', {
        event: 'checklist.create',
        itemId: item.id,
        taskId,
        actorId: actor.id,
      })
      return toChecklistItemResponse(item)
    })
  }

  /**
   * CHECK-002 — toggle `completed` and/or edit `content` (independent
   * fields, allowlisted). expectedVersion is REQUIRED (ADR-004): resolved
   * first, then committed via compare-and-swap — count 0 means the row moved
   * since our read (409 STALE_VERSION with the current safe state).
   */
  async update(
    taskId: string,
    itemId: string,
    dto: UpdateChecklistItemDto,
    actor: AuthUser,
  ): Promise<ChecklistItemResponse> {
    // class-transformer exposes unset class props as undefined keys (v0.5+),
    // so an expectedVersion-only body would slip through a key-count check as
    // a silent no-op update (same guard as LabelsService.update).
    if (dto.completed === undefined && dto.content === undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        detail: 'At least one of (completed, content) must be provided.',
      })
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await this.resolveTask(tx, taskId)
      if (!task) throw new NotFoundException(TASK_NOT_FOUND)
      this.assertCanEdit(task, actor) // 404 member / 409 TASK_ARCHIVED admin / 403 unrelated

      const item = await this.resolveItem(tx, itemId, taskId)
      if (!item) throw new NotFoundException(ITEM_NOT_FOUND)
      this.assertVersion(item, dto.expectedVersion)

      // ADR-004 compare-and-swap: count 0 -> the row moved since our read.
      const cas = await tx.checklistItem.updateMany({
        where: { id: itemId, taskId, version: dto.expectedVersion },
        data: {
          version: { increment: 1 },
          updatedAt: new Date(),
          ...(dto.completed !== undefined ? { completed: dto.completed } : {}),
          ...(dto.content !== undefined ? { content: dto.content } : {}),
        },
      })
      if (cas.count === 0) {
        throw this.staleVersion(item)
      }

      const updated = await tx.checklistItem.findUniqueOrThrow({ where: { id: itemId } })
      this.logger.log('checklist.update', {
        event: 'checklist.update',
        itemId,
        taskId,
        actorId: actor.id,
        toggled: dto.completed !== undefined,
        contentEdited: dto.content !== undefined,
      })
      return toChecklistItemResponse(updated)
    })
  }

  /**
   * CHECK-002 — remove an item (same permission as editing the task).
   * Returns the last-known item state, before the delete (labels/contacts
   * pattern). The item is resolved FIRST so an unknown id is a 404 and the
   * delete itself stays a plain single-row operation.
   */
  async remove(taskId: string, itemId: string, actor: AuthUser): Promise<ChecklistItemResponse> {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.resolveTask(tx, taskId)
      if (!task) throw new NotFoundException(TASK_NOT_FOUND)
      this.assertCanEdit(task, actor) // 404 member / 409 TASK_ARCHIVED admin / 403 unrelated

      const item = await this.resolveItem(tx, itemId, taskId)
      if (!item) throw new NotFoundException(ITEM_NOT_FOUND)

      await tx.checklistItem.delete({ where: { id: itemId } })
      this.logger.log('checklist.remove', { event: 'checklist.remove', itemId, taskId, actorId: actor.id })
      return toChecklistItemResponse(item)
    })
  }

  /**
   * CHECK-001 — apply the client's full ordering atomically (ONE transaction).
   * Every id in the body must belong to the task — an id from another task is
   * indistinguishable from an unknown one (404 CHECKLIST_ITEM_NOT_FOUND,
   * BOLA-safe). Duplicate ids in the body are rejected up front (400 — an
   * ambiguous instruction). sortOrder-only updates: item versions are NOT
   * bumped, so a reorder never invalidates an in-flight toggle (CHECK-002).
   */
  async reorder(taskId: string, dto: ReorderChecklistDto, actor: AuthUser): Promise<ChecklistItemResponse[]> {
    const seen = new Set<string>()
    for (const item of dto.items) {
      if (seen.has(item.id)) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          detail: `Checklist item ${item.id} appears more than once in the reorder payload.`,
        })
      }
      seen.add(item.id)
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await this.resolveTask(tx, taskId)
      if (!task) throw new NotFoundException(TASK_NOT_FOUND)
      this.assertCanEdit(task, actor) // 404 member / 409 TASK_ARCHIVED admin / 403 unrelated

      const owned = await tx.checklistItem.findMany({ where: { taskId }, select: { id: true } })
      const ownedIds = new Set(owned.map((row) => row.id))
      for (const entry of dto.items) {
        if (!ownedIds.has(entry.id)) {
          throw new NotFoundException(ITEM_NOT_FOUND)
        }
      }

      for (const entry of dto.items) {
        await tx.checklistItem.update({
          where: { id: entry.id },
          data: { sortOrder: entry.sortOrder },
        })
      }

      const items = await tx.checklistItem.findMany({
        where: { taskId },
        orderBy: CHECKLIST_ORDER,
      })
      this.logger.log('checklist.reorder', {
        event: 'checklist.reorder',
        taskId,
        actorId: actor.id,
        count: dto.items.length,
      })
      return items.map(toChecklistItemResponse)
    })
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * BOLA-safe visibility gate: the checklist is only reachable when the task
   * itself is viewable (canViewTask — archived: admin only). Unknown ids and
   * non-visible tasks produce the SAME 404 (same gate as CommentsService).
   */
  private async assertTaskVisible(taskId: string, actor: AuthUser): Promise<void> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, archivedAt: true, creatorId: true, assigneeId: true },
    })
    if (!task || !canViewTask(actor, task)) {
      throw new NotFoundException(TASK_NOT_FOUND)
    }
  }

  private async resolveTask(
    db: Prisma.TransactionClient | PrismaService,
    taskId: string,
  ): Promise<TaskRow | null> {
    return db.task.findUnique({
      where: { id: taskId },
      select: { id: true, archivedAt: true, creatorId: true, assigneeId: true },
    })
  }

  /** Item scoped to the task: an item of ANOTHER task is a 404 (BOLA-safe). */
  private async resolveItem(
    db: Prisma.TransactionClient | PrismaService,
    itemId: string,
    taskId: string,
  ): Promise<ChecklistItem | null> {
    const item = await db.checklistItem.findUnique({ where: { id: itemId } })
    if (!item || item.taskId !== taskId) return null
    return item
  }

  /**
   * Authorization inside the transaction (same branches as
   * TasksService.assertCanEdit — the checklist shares the task edit policy,
   * CHECK-002). Archived tasks are immutable: an admin gets 409
   * TASK_ARCHIVED, a member gets the same 404 as an unknown id (BOLA-safe,
   * BR-016) — members never learn the task exists.
   */
  private assertCanEdit(task: TaskRow, actor: AuthUser): void {
    if (task.archivedAt) {
      if (actor.role !== 'ADMIN') throw new NotFoundException(TASK_NOT_FOUND)
      throw new ConflictException(TASK_ARCHIVED)
    }
    if (!canEditTask(actor, task)) {
      throw new ForbiddenException(FORBIDDEN_EDIT)
    }
  }

  /** ADR-004 / DEC-034: expectedVersion must match the current row version. */
  private assertVersion(item: ChecklistItem, expectedVersion: number): void {
    if (item.version !== expectedVersion) {
      throw this.staleVersion(item)
    }
  }

  /** 409 STALE_VERSION with the current safe state (openapi-and-errors.md §3.6). */
  private staleVersion(item: ChecklistItem): ConflictException {
    return new ConflictException({
      code: 'STALE_VERSION',
      detail: 'This checklist item was modified by someone else. Review the current state and retry.',
      currentVersion: item.version,
      currentState: {
        content: item.content,
        completed: item.completed,
        sortOrder: item.sortOrder,
      },
    })
  }
}
