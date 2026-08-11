// Comments controller — COMM-001 (PC-03).
//
// Routes (global prefix /api + URI versioning v1, task-scoped):
//   POST   /api/v1/tasks/:taskId/comments   -> create (201 + Location; any authenticated user)
//   GET    /api/v1/tasks/:taskId/comments   -> paginated thread, newest first
//
// Append-only: no PATCH/DELETE routes exist for comments. Authentication is
// the global JwtAuthGuard; object-level authorization (task visibility,
// BOLA-safe) lives in CommentsService via tasks.policy.canViewTask. :taskId is
// validated as a UUID at the boundary — a malformed id is a 400
// INVALID_FORMAT, never a 500 from Prisma's UUID cast error.
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common'
import type { Response } from 'express'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import type { AuthUser } from '../auth/auth.types'
import { CommentsService } from './comments.service'
import { CreateCommentDto } from './dto/create-comment.dto'
import { CommentQueryDto } from './dto/comment-query.dto'
import type { CommentResponse, PageMeta } from './dto/comment-response.dto'

const UUID_PIPE = new ParseUUIDPipe({
  exceptionFactory: (): BadRequestException =>
    new BadRequestException({
      code: 'INVALID_FORMAT',
      detail: 'The task id must be a valid UUID.',
    }),
})

@Controller('tasks/:taskId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('taskId', UUID_PIPE) taskId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: CommentResponse }> {
    const comment = await this.commentsService.create(taskId, dto, user)
    res.location(`/api/v1/tasks/${taskId}/comments/${comment.id}`)
    return { data: comment }
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Param('taskId', UUID_PIPE) taskId: string,
    @Query() query: CommentQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: CommentResponse[]; meta: PageMeta }> {
    return this.commentsService.findAll(taskId, query, user)
  }
}
