// Tasks controller — TASK-API-002..010 (PH-06).
//
// Routes (global prefix /api + URI versioning v1):
//   GET    /api/v1/tasks/board              -> backlog + active columns (TASK-API-009)
//   GET    /api/v1/tasks/archived           -> admin-only archived list (TASK-API-010)
//   POST   /api/v1/tasks                    -> create (201 + Location; any active user)
//   GET    /api/v1/tasks                    -> paginated active list (TASK-API-010)
//   GET    /api/v1/tasks/:id                -> detail (TASK-API-010)
//   PATCH  /api/v1/tasks/:id                -> update (TASK-API-003)
//   PATCH  /api/v1/tasks/:id/status         -> status transitions (TASK-API-004)
//   POST   /api/v1/tasks/:id/archive        -> archive, ADMIN only (TASK-API-006)
//   GET    /api/v1/tasks/:id/history        -> append-only timeline (TASK-API-007)
//
// The controller is NOT class-level admin: reads and create are team-wide
// (BR-005/006 view rules); object-level authorization (BR-013/014/015) lives
// in TasksService/tasks.policy.ts, enforced inside the mutation transaction.
// Only the archived view and the archive mutation carry @Roles(UserRole.ADMIN).
// :id is validated as a UUID at the boundary — a malformed id is a 400
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
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common'
import type { Response } from 'express'
import { UserRole } from '../../../../../packages/api-contract/src/generated/prisma/client'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import type { AuthUser } from '../auth/auth.types'
import { ArchiveTaskDto } from './dto/archive-task.dto'
import { ChangeTaskStatusDto } from './dto/change-task-status.dto'
import { CreateTaskDto } from './dto/create-task.dto'
import { TaskQueryDto } from './dto/task-query.dto'
import type { BoardResponse, PageMeta, TaskChangeResponse, TaskResponse, TaskSummary } from './dto/task-response.dto'
import { UpdateTaskDto } from './dto/update-task.dto'
import { TasksService } from './tasks.service'

const UUID_PIPE = new ParseUUIDPipe({
  exceptionFactory: (): BadRequestException =>
    new BadRequestException({
      code: 'INVALID_FORMAT',
      detail: 'The task id must be a valid UUID.',
    }),
})

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('board')
  @HttpCode(HttpStatus.OK)
  async board(@Query() query: TaskQueryDto, @CurrentUser() user: AuthUser): Promise<BoardResponse> {
    return this.tasksService.board(query, user)
  }

  @Get('archived')
  @Roles(UserRole.ADMIN) // FR-TASK-011: admin-only archived view
  @HttpCode(HttpStatus.OK)
  async archived(
    @Query() query: TaskQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: TaskResponse[]; meta: PageMeta }> {
    return this.tasksService.archived(query, user)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: TaskResponse }> {
    const task = await this.tasksService.create(dto, user)
    res.location(`/api/v1/tasks/${task.id}`)
    return { data: task }
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() query: TaskQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: TaskSummary[]; meta: PageMeta }> {
    return this.tasksService.findAll(query, user)
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', UUID_PIPE) id: string, @CurrentUser() user: AuthUser): Promise<{ data: TaskResponse }> {
    return { data: await this.tasksService.findOne(id, user) }
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', UUID_PIPE) id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: TaskResponse }> {
    return { data: await this.tasksService.update(id, dto, user) }
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async changeStatus(
    @Param('id', UUID_PIPE) id: string,
    @Body() dto: ChangeTaskStatusDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: TaskResponse }> {
    return { data: await this.tasksService.changeStatus(id, dto, user) }
  }

  @Post(':id/archive')
  @Roles(UserRole.ADMIN) // BR-015: admin-only mutation
  @HttpCode(HttpStatus.OK)
  async archive(
    @Param('id', UUID_PIPE) id: string,
    @Body() dto: ArchiveTaskDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: TaskResponse }> {
    return { data: await this.tasksService.archive(id, dto, user) }
  }

  @Get(':id/history')
  @HttpCode(HttpStatus.OK)
  async history(
    @Param('id', UUID_PIPE) id: string,
    @Query() query: TaskQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: TaskChangeResponse[]; meta: PageMeta }> {
    return this.tasksService.history(id, query, user)
  }
}
