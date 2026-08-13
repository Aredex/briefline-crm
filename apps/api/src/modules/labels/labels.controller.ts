// Labels controller — LAB-001/002 (PC-04).
//
// Routes (global prefix /api + URI versioning v1):
//   GET    /api/v1/labels                     -> catalogue list (any authenticated user)
//   POST   /api/v1/labels                     -> create (201 + Location; ADMIN only)
//   PATCH  /api/v1/labels/:id                 -> update (ADMIN only)
//   DELETE /api/v1/labels/:id                 -> delete (ADMIN only; task assignments cascade)
//   POST   /api/v1/tasks/:taskId/labels/:labelId  -> assign (task edit policy, LAB-002)
//   DELETE /api/v1/tasks/:taskId/labels/:labelId  -> remove (task edit policy, LAB-002)
//
// Catalogue reads are team-wide (the global JwtAuthGuard); catalogue mutations
// carry @Roles(UserRole.ADMIN) (LAB-001). The task-scoped assignment routes
// are NOT class-level admin: object-level authorization (canEditTask +
// archived rules) lives in LabelsService, enforced inside the transaction.
// Both :taskId and :labelId are validated as UUIDs at the boundary — a
// malformed id is a 400 INVALID_FORMAT, never a 500 from Prisma's UUID cast.
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
import { UserRole } from '../../generated/prisma/client'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import type { AuthUser } from '../auth/auth.types'
import { CreateLabelDto } from './dto/create-label.dto'
import { UpdateLabelDto } from './dto/update-label.dto'
import type { LabelResponse } from './dto/label-response.dto'
import { LabelsService } from './labels.service'

const TASK_UUID_PIPE = new ParseUUIDPipe({
  exceptionFactory: (): BadRequestException =>
    new BadRequestException({
      code: 'INVALID_FORMAT',
      detail: 'The task id must be a valid UUID.',
    }),
})

const LABEL_UUID_PIPE = new ParseUUIDPipe({
  exceptionFactory: (): BadRequestException =>
    new BadRequestException({
      code: 'INVALID_FORMAT',
      detail: 'The label id must be a valid UUID.',
    }),
})

// Single controller for both route groups: the catalogue owns /labels, the
// task-scoped assignment routes own /tasks/:taskId/labels/:labelId (LAB-002).
@Controller()
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Get('labels')
  @HttpCode(HttpStatus.OK)
  async findAll(@CurrentUser() user: AuthUser): Promise<{ data: LabelResponse[] }> {
    return { data: await this.labelsService.findAll(user) }
  }

  @Post('labels')
  @Roles(UserRole.ADMIN) // LAB-001: catalogue mutations are admin-only
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateLabelDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: LabelResponse }> {
    const label = await this.labelsService.create(dto, user)
    res.location(`/api/v1/labels/${label.id}`)
    return { data: label }
  }

  @Patch('labels/:id')
  @Roles(UserRole.ADMIN) // LAB-001: catalogue mutations are admin-only
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', LABEL_UUID_PIPE) id: string,
    @Body() dto: UpdateLabelDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: LabelResponse }> {
    return { data: await this.labelsService.update(id, dto, user) }
  }

  @Delete('labels/:id')
  @Roles(UserRole.ADMIN) // LAB-001: catalogue mutations are admin-only
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', LABEL_UUID_PIPE) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: LabelResponse }> {
    return { data: await this.labelsService.remove(id, user) }
  }

  @Post('tasks/:taskId/labels/:labelId')
  @HttpCode(HttpStatus.OK)
  async assign(
    @Param('taskId', TASK_UUID_PIPE) taskId: string,
    @Param('labelId', LABEL_UUID_PIPE) labelId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: LabelResponse }> {
    return { data: await this.labelsService.assign(taskId, labelId, user) }
  }

  @Delete('tasks/:taskId/labels/:labelId')
  @HttpCode(HttpStatus.OK)
  async unassign(
    @Param('taskId', TASK_UUID_PIPE) taskId: string,
    @Param('labelId', LABEL_UUID_PIPE) labelId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: LabelResponse }> {
    return { data: await this.labelsService.unassign(taskId, labelId, user) }
  }
}
