// PATCH /tasks/:taskId/checklist/reorder body — CHECK-001 (PC-05).
//
// The client sends the full ordered list: `{ items: [{ id, sortOrder }] }`.
// The service applies every (id, sortOrder) pair atomically in ONE transaction
// and rejects duplicate ids (400 VALIDATION_ERROR — a duplicated entry is an
// ambiguous instruction, never a silent last-wins). sortOrder is a
// non-negative integer; the list must be non-empty. Ids are validated as
// UUIDs at the boundary (400 INVALID_FORMAT, never a 500).
import { Type } from 'class-transformer'
import { ArrayNotEmpty, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator'

export class ReorderItemDto {
  @IsUUID()
  id!: string

  @IsInt()
  @Min(0)
  sortOrder!: number
}

export class ReorderChecklistDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[]
}
