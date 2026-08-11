// POST /tasks body — TASK-API-002 (PH-06).
//
// Creator is NEVER accepted from the body — the authenticated actor is
// recorded by the service (same invariant as clients/createdById).
// Status defaults to BACKLOG (BR-008: may be unassigned); priority defaults
// to MEDIUM. `expectedVersion` is optional for create (no prior state exists)
// and MUST be 0 when present (the server starts version at 1).
//
// dueDate is a strict 'YYYY-MM-DD' date-only value (ADR-003): a full ISO
// timestamp or any non-date string fails validation with INVALID_FORMAT
// instead of being silently truncated.
import { Transform } from 'class-transformer'
import { IsDate, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator'
import { TaskPriority, TaskStatus } from '../../../../../../packages/api-contract/src/generated/prisma/client'

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** 'YYYY-MM-DD' -> UTC-midnight Date (matches @db.Date serialization, ADR-003). */
const toDateOnly = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && DATE_ONLY.test(value) ? new Date(value) : value

export class CreateTaskDto {
  @IsString()
  @Length(1, 160)
  @Transform(trimString)
  title!: string

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(trimString)
  description?: string

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus // service defaults to BACKLOG

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority // service defaults to MEDIUM

  @IsOptional()
  @IsUUID()
  assigneeId?: string | null

  @IsOptional()
  @IsUUID()
  clientId?: string | null

  @IsOptional()
  @Transform(toDateOnly)
  @IsDate()
  dueDate?: Date | null

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trimString)
  blockedReason?: string | null

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(0)
  expectedVersion?: number
}
