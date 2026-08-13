// PATCH /tasks/:id body — TASK-API-003 (PH-06).
//
// Strict field-level allowlist (NFR-SEC-005): title, description, priority,
// assigneeId, clientId, dueDate, blockedReason. `status` is NOT editable here —
// the dedicated PATCH /tasks/:id/status endpoint owns transitions (TASK-API-004).
// `expectedVersion` is REQUIRED on every mutation (ADR-004) and the body must
// carry at least one editable field besides it (the service rejects an
// expectedVersion-only body with 400).
//
// `assigneeId: null` unassigns — only allowed while BACKLOG, else 422
// ASSIGNEE_REQUIRED (BR-009). `dueDate: null` clears the deadline (BR-020).
// `blockedReason` is only accepted while the task is BLOCKED (BR-011); the
// server clears it when the task leaves BLOCKED via the status endpoint.
import { Transform } from 'class-transformer'
import { IsDate, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator'
import { TaskPriority } from '../../../generated/prisma/client'

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** 'YYYY-MM-DD' -> UTC-midnight Date (matches @db.Date serialization, ADR-003). */
const toDateOnly = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && DATE_ONLY.test(value) ? new Date(value) : value

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  @Transform(trimString)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(trimString)
  description?: string

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority

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

  @IsInt()
  @Min(1)
  expectedVersion!: number
}
