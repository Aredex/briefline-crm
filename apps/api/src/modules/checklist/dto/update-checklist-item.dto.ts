// PATCH /tasks/:taskId/checklist/:itemId body — CHECK-002 (PC-05).
//
// Toggle (`completed`) and content edit are INDEPENDENT fields: the client
// may send either, both, or neither — the service rejects an empty body with
// 400 VALIDATION_ERROR. `expectedVersion` is REQUIRED on every mutation
// (ADR-004): the CAS compares it against the row version and answers 409
// STALE_VERSION on mismatch. Content is trimmed and constrained to 1..500
// chars (@db.VarChar(500)).
import { Transform } from 'class-transformer'
import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator'

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

export class UpdateChecklistItemDto {
  @IsOptional()
  @IsBoolean()
  completed?: boolean

  @IsOptional()
  @IsString()
  @Length(1, 500)
  @Transform(trimString)
  content?: string

  @IsInt()
  @Min(1)
  expectedVersion!: number
}
