// POST /tasks/:id/archive body — TASK-API-006 (PH-06).
//
// Admin-only (BR-015, controller @Roles). The only accepted field is
// `expectedVersion` (ADR-004): a stale value is a 409 STALE_VERSION, and a
// double archive is a 409 TASK_ARCHIVED no-op (no second history event).
import { IsInt, Min } from 'class-validator'

export class ArchiveTaskDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number
}
