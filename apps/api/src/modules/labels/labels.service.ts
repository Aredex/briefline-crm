// Labels service — LAB-001/002 (PC-04).
//
// Two responsibilities:
//
//   1. Catalogue CRUD (LAB-001, ADMIN): labels are a normalized team-wide
//      catalogue — create/update/delete carry @Roles(UserRole.ADMIN) at the
//      controller; reads are team-wide for every authenticated user. The
//      unique index on `name` is the DB-level invariant; a P2002 becomes
//      409 LABEL_NAME_EXISTS (same pattern as CONTACT_EMAIL_EXISTS in
//      ContactsService), never a 500.
//   2. Task assignment (LAB-002, task edit policy): POST/DELETE
//      /tasks/:taskId/labels/:labelId route through the SAME object policy as
//      task edits (tasks.policy.canEditTask + the archived branch of
//      TasksService.assertCanEdit): archived tasks are 404 for members
//      (BOLA-safe, identical to an unknown id — BR-016) and 409 TASK_ARCHIVED
//      for admins; unrelated members get 403, never a hint about the task's
//      existence. Assigning is an idempotent upsert (the composite PK
//      (taskId, labelId) makes duplicates impossible); removing an unassigned
//      pair is a 200 no-op.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '../../generated/prisma/client'
import type { AuthUser } from '../auth/auth.types'
import { CustomLogger } from '../../common/logger/custom.logger'
import { PrismaService } from '../../database/prisma.service'
import { canEditTask } from '../tasks/tasks.policy'
import type { CreateLabelDto } from './dto/create-label.dto'
import type { UpdateLabelDto } from './dto/update-label.dto'
import type { LabelResponse } from './dto/label-response.dto'
import { toLabelResponse } from './labels.mapper'

// Same code/detail as TasksService/CommentsService: a label assignment on a
// non-visible task is indistinguishable from one on an unknown task
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

const LABEL_NOT_FOUND = {
  code: 'LABEL_NOT_FOUND',
  detail: 'The requested label does not exist.',
}

const LABEL_NAME_EXISTS = {
  code: 'LABEL_NAME_EXISTS',
  detail: 'A label with this name already exists.',
}

// Contractual catalogue order: alphabetical by name, id tiebreak.
const LABEL_ORDER: Prisma.LabelOrderByWithRelationInput[] = [{ name: 'asc' }, { id: 'asc' }]

@Injectable()
export class LabelsService {
  private readonly logger = new CustomLogger('LabelsService')

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Catalogue (LAB-001)
  // ---------------------------------------------------------------------------

  /** LAB-001 — full catalogue, alphabetical (team-wide read). */
  async findAll(actor: AuthUser): Promise<LabelResponse[]> {
    void actor // team-wide view — the guard only enforces authentication
    const labels = await this.prisma.label.findMany({ orderBy: LABEL_ORDER })
    return labels.map(toLabelResponse)
  }

  /** LAB-001 — create (ADMIN). Duplicate name -> 409 LABEL_NAME_EXISTS. */
  async create(dto: CreateLabelDto, actor: AuthUser): Promise<LabelResponse> {
    const label = await this.prisma.label
      .create({
        data: {
          name: dto.name,
          color: dto.color ?? '#6b7280', // schema default mirrored for the create path
        },
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw this.duplicateName()
        }
        throw error
      })
    this.logger.log('labels.create', { event: 'labels.create', labelId: label.id, actorId: actor.id })
    return toLabelResponse(label)
  }

  /** LAB-001 — field-level allowlist update (ADMIN). Empty body -> 400. */
  async update(id: string, dto: UpdateLabelDto, actor: AuthUser): Promise<LabelResponse> {
    // class-transformer exposes unset class props as undefined keys (v0.5+),
    // so an empty body `{}` arrives with all keys undefined — checking key
    // count would let it through as a silent no-op update.
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        detail: 'At least one field (name or color) must be provided.',
      })
    }
    const existing = await this.prisma.label.findUnique({ where: { id }, select: { id: true } })
    if (!existing) {
      throw new NotFoundException(LABEL_NOT_FOUND)
    }
    try {
      const updated = await this.prisma.label.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
        },
      })
      this.logger.log('labels.update', { event: 'labels.update', labelId: id, actorId: actor.id })
      return toLabelResponse(updated)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw this.duplicateName()
      }
      throw error
    }
  }

  /**
   * LAB-001 — physical delete (ADMIN). 404 on unknown. task_labels rows are
   * removed by the DB FK (ON DELETE CASCADE) — the catalogue keeps no orphans.
   * Returns the last-known label state, before the delete (contacts pattern).
   */
  async remove(id: string, actor: AuthUser): Promise<LabelResponse> {
    const label = await this.prisma.label.findUnique({ where: { id } })
    if (!label) {
      throw new NotFoundException(LABEL_NOT_FOUND)
    }
    await this.prisma.label.delete({ where: { id } })
    this.logger.log('labels.remove', { event: 'labels.remove', labelId: id, actorId: actor.id })
    return toLabelResponse(label)
  }

  // ---------------------------------------------------------------------------
  // Task assignment (LAB-002)
  // ---------------------------------------------------------------------------

  /**
   * LAB-002 — assign a label to a task (same permission as editing the task).
   * Idempotent: re-assigning an already-assigned label is a 200 no-op (upsert
   * against the composite PK). The mutation and the visibility check commit
   * atomically (same spirit as TASK-API-008).
   */
  async assign(taskId: string, labelId: string, actor: AuthUser): Promise<LabelResponse> {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.resolveTask(tx, taskId)
      if (!task) throw new NotFoundException(TASK_NOT_FOUND)
      this.assertCanEdit(task, actor) // 404 member / 409 TASK_ARCHIVED admin / 403 unrelated
      const label = await tx.label.findUnique({ where: { id: labelId } })
      if (!label) throw new NotFoundException(LABEL_NOT_FOUND)

      await tx.taskLabel.upsert({
        where: { taskId_labelId: { taskId, labelId } },
        create: { taskId, labelId },
        update: {}, // idempotent: re-assignment changes nothing
      })
      this.logger.log('labels.assign', { event: 'labels.assign', taskId, labelId, actorId: actor.id })
      return toLabelResponse(label)
    })
  }

  /**
   * LAB-002 — remove a label from a task (same permission as editing the
   * task). Idempotent: removing an unassigned pair is a 200 no-op. Returns
   * the last-known label state (it still exists in the catalogue).
   */
  async unassign(taskId: string, labelId: string, actor: AuthUser): Promise<LabelResponse> {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.resolveTask(tx, taskId)
      if (!task) throw new NotFoundException(TASK_NOT_FOUND)
      this.assertCanEdit(task, actor) // 404 member / 409 TASK_ARCHIVED admin / 403 unrelated
      const label = await tx.label.findUnique({ where: { id: labelId } })
      if (!label) throw new NotFoundException(LABEL_NOT_FOUND)

      await tx.taskLabel.deleteMany({ where: { taskId, labelId } }) // idempotent: 0 rows is fine
      this.logger.log('labels.unassign', { event: 'labels.unassign', taskId, labelId, actorId: actor.id })
      return toLabelResponse(label)
    })
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async resolveTask(db: Prisma.TransactionClient | PrismaService, taskId: string): Promise<{
    id: string
    archivedAt: Date | null
    creatorId: string
    assigneeId: string | null
  } | null> {
    return db.task.findUnique({
      where: { id: taskId },
      select: { id: true, archivedAt: true, creatorId: true, assigneeId: true },
    })
  }

  /**
   * Authorization inside the transaction (same branches as
   * TasksService.assertCanEdit — the label assignment shares the task edit
   * policy, LAB-002). Archived tasks are immutable: an admin gets 409
   * TASK_ARCHIVED, a member gets the same 404 as an unknown id (BOLA-safe,
   * BR-016) — members never learn the task exists.
   */
  private assertCanEdit(
    task: { archivedAt: Date | null; creatorId: string; assigneeId: string | null },
    actor: AuthUser,
  ): void {
    if (task.archivedAt) {
      if (actor.role !== 'ADMIN') throw new NotFoundException(TASK_NOT_FOUND)
      throw new ConflictException(TASK_ARCHIVED)
    }
    if (!canEditTask(actor, task)) {
      throw new ForbiddenException(FORBIDDEN_EDIT)
    }
  }

  /** 409 for the labels unique index on name — LAB-001. */
  private duplicateName(): ConflictException {
    return new ConflictException({
      ...LABEL_NAME_EXISTS,
      errors: [{ field: 'name', message: LABEL_NAME_EXISTS.detail, code: LABEL_NAME_EXISTS.code }],
    })
  }
}
