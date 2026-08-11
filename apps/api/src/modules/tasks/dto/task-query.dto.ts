// Task query params — TASK-API-009/010 (PH-06).
//
// Shared by GET /tasks, GET /tasks/board and GET /tasks/archived:
//   - page/limit: offset pagination (1/25 defaults, max 100 — 400 above).
//   - q: case-insensitive title/description search (max 100 chars).
//   - status/priority: enum filters; on the board `status` selects ONE column.
//   - assigneeId/clientId: UUID filters (malformed ids -> 400 INVALID_FORMAT).
//   - dueBefore/dueAfter: inclusive date range on dueDate (ADR-003 date-only).
//
// @Type is required everywhere (the global pipe runs with
// enableImplicitConversion: false — AP-51), so a non-numeric page/limit or a
// non-date dueBefore/dueAfter fails validation instead of passing through.
import { Transform, Type } from 'class-transformer'
import { IsDate, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator'
import { TaskPriority, TaskStatus } from '../../../../../../packages/api-contract/src/generated/prisma/client'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const toDateOnly = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && DATE_ONLY.test(value) ? new Date(value) : value

export class TaskQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority

  @IsOptional()
  @IsUUID()
  assigneeId?: string

  @IsOptional()
  @IsUUID()
  clientId?: string

  @IsOptional()
  @Transform(toDateOnly)
  @IsDate()
  dueBefore?: Date

  @IsOptional()
  @Transform(toDateOnly)
  @IsDate()
  dueAfter?: Date
}
