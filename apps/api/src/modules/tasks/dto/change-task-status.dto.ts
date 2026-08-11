// PATCH /tasks/:id/status body — TASK-API-004 (PH-06).
//
// Free status transitions (DEC-024); COMPLETED may be reopened (BR-012).
// Entering BLOCKED requires a non-empty `blockedReason` (BR-010) — the service
// enforces it with 422 BLOCKED_REASON_REQUIRED when missing/blank. Leaving
// BLOCKED clears the active reason while the old value remains in the
// append-only history (BR-011). `expectedVersion` is REQUIRED (ADR-004).
import { Transform } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { TaskStatus } from '../../../../../../packages/api-contract/src/generated/prisma/client'

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

export class ChangeTaskStatusDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trimString)
  blockedReason?: string | null

  @IsInt()
  @Min(1)
  expectedVersion!: number
}
