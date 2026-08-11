// Checklist controller — CHECK-001/002 (PC-05).
//
// Routes (global prefix /api + URI versioning v1, task-scoped):
//   GET    /api/v1/tasks/:taskId/checklist               -> full list, sortOrder ascending
//   POST   /api/v1/tasks/:taskId/checklist               -> append (201 + Location)
//   PATCH  /api/v1/tasks/:taskId/checklist/reorder       -> apply full ordering (atomic)
//   PATCH  /api/v1/tasks/:taskId/checklist/:itemId       -> toggle completed / edit content (CAS)
//   DELETE /api/v1/tasks/:taskId/checklist/:itemId       -> remove
//
// Authentication is the global JwtAuthGuard; object-level authorization
// (task visibility for reads, task edit policy for mutations — BOLA-safe)
// lives in ChecklistService via tasks.policy. Both :taskId and :itemId are
// validated as UUIDs at the boundary — a malformed id is a 400
// INVALID_FORMAT, never a 500 from Prisma's UUID cast error. The static
// `reorder` route MUST be declared before the parametric `:itemId` route:
// Express matches in registration order, otherwise PATCH /reorder would be
// captured by :itemId and die in ParseUUIDPipe.
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common'
import type { Response } from 'express'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import type { AuthUser } from '../auth/auth.types'
import { ChecklistService } from './checklist.service'
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto'
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto'
import { ReorderChecklistDto } from './dto/reorder-checklist.dto'
import type { ChecklistItemResponse } from './dto/checklist-item-response.dto'

const TASK_UUID_PIPE = new ParseUUIDPipe({
  exceptionFactory: (): BadRequestException =>
    new BadRequestException({
      code: 'INVALID_FORMAT',
      detail: 'The task id must be a valid UUID.',
    }),
})

const ITEM_UUID_PIPE = new ParseUUIDPipe({
  exceptionFactory: (): BadRequestException =>
    new BadRequestException({
      code: 'INVALID_FORMAT',
      detail: 'The checklist item id must be a valid UUID.',
    }),
})

@Controller('tasks/:taskId/checklist')
export class ChecklistController {
  constructor(private readonly checklistService: ChecklistService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Param('taskId', TASK_UUID_PIPE) taskId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: ChecklistItemResponse[] }> {
    return { data: await this.checklistService.findAll(taskId, user) }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('taskId', TASK_UUID_PIPE) taskId: string,
    @Body() dto: CreateChecklistItemDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: ChecklistItemResponse }> {
    const item = await this.checklistService.create(taskId, dto, user)
    res.location(`/api/v1/tasks/${taskId}/checklist/${item.id}`)
    return { data: item }
  }

  // Static route BEFORE :itemId (Express registration order, see header).
  @Patch('reorder')
  @HttpCode(HttpStatus.OK)
  async reorder(
    @Param('taskId', TASK_UUID_PIPE) taskId: string,
    @Body() dto: ReorderChecklistDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: ChecklistItemResponse[] }> {
    return { data: await this.checklistService.reorder(taskId, dto, user) }
  }

  @Patch(':itemId')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('taskId', TASK_UUID_PIPE) taskId: string,
    @Param('itemId', ITEM_UUID_PIPE) itemId: string,
    @Body() dto: UpdateChecklistItemDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: ChecklistItemResponse }> {
    return { data: await this.checklistService.update(taskId, itemId, dto, user) }
  }

  @Delete(':itemId')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('taskId', TASK_UUID_PIPE) taskId: string,
    @Param('itemId', ITEM_UUID_PIPE) itemId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: ChecklistItemResponse }> {
    return { data: await this.checklistService.remove(taskId, itemId, user) }
  }
}
