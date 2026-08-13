// Comments service — COMM-001 (PC-03).
//
// Append-only: CREATE + READ only. There are no update/delete routes — once
// written, a comment is immutable (same spirit as TaskChange history,
// TASK-API-007).
//
// Authorization is the TASK visibility rule (tasks.policy.canViewTask): a
// comment is only reachable when the task itself is visible. Archived tasks
// are 404 for members — identical to an unknown id (BOLA-safe, BR-016). The
// author is ALWAYS the authenticated actor (actor.id from the JWT); an
// authorId in the body is ignored (the create DTO does not even accept it).
import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '../../generated/prisma/client'
import type { AuthUser } from '../auth/auth.types'
import { CustomLogger } from '../../common/logger/custom.logger'
import { PrismaService } from '../../database/prisma.service'
import { canViewTask } from '../tasks/tasks.policy'
import type { CreateCommentDto } from './dto/create-comment.dto'
import type { CommentQueryDto } from './dto/comment-query.dto'
import type { CommentResponse, PageMeta } from './dto/comment-response.dto'
import { toCommentResponse } from './comments.mapper'

// Same code/detail as TasksService: a comment on a non-visible task is
// indistinguishable from one on an unknown task (BOLA-safe, BR-016).
const TASK_NOT_FOUND = {
  code: 'TASK_NOT_FOUND',
  detail: 'The requested task does not exist or is not visible to you.',
}

/** Newest-first thread order (COMM-001); id tiebreak for same-instant writes. */
const THREAD_ORDER: Prisma.CommentOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }]

const COMMENT_INCLUDE = {
  author: { select: { id: true, name: true } },
} as const satisfies Prisma.CommentInclude

@Injectable()
export class CommentsService {
  private readonly logger = new CustomLogger('CommentsService')

  constructor(private readonly prisma: PrismaService) {}

  /** COMM-001 — create on a visible task; author is always the actor. */
  async create(taskId: string, dto: CreateCommentDto, actor: AuthUser): Promise<CommentResponse> {
    await this.assertTaskVisible(taskId, actor)
    const comment = await this.prisma.comment.create({
      data: { taskId, authorId: actor.id, content: dto.content },
      include: COMMENT_INCLUDE,
    })
    this.logger.log('comments.create', {
      event: 'comments.create',
      commentId: comment.id,
      taskId,
      actorId: actor.id,
    })
    return toCommentResponse(comment)
  }

  /** COMM-001 — paginated thread, newest first. */
  async findAll(
    taskId: string,
    query: CommentQueryDto,
    actor: AuthUser,
  ): Promise<{ data: CommentResponse[]; meta: PageMeta }> {
    await this.assertTaskVisible(taskId, actor)
    const where: Prisma.CommentWhereInput = { taskId }
    const [total, comments] = await this.prisma.$transaction([
      this.prisma.comment.count({ where }),
      this.prisma.comment.findMany({
        where,
        include: COMMENT_INCLUDE,
        orderBy: THREAD_ORDER,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ])
    return {
      data: comments.map(toCommentResponse),
      meta: { page: query.page, limit: query.limit, total },
    }
  }

  /**
   * BOLA-safe visibility gate: the comment thread is only reachable when the
   * task itself is viewable (canViewTask — archived: admin only). Unknown ids
   * and non-visible tasks produce the SAME 404.
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
}
