// Comment list query params — COMM-001 (PC-03).
//
// Offset pagination only (page/limit, 1/25 defaults, max 100 — 400 above),
// mirroring TaskQueryDto. The order is contractual: newest first (createdAt
// desc, id desc tiebreak) — no sort/order overrides exist for the thread.
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

export class CommentQueryDto {
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
}
