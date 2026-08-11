// POST /tasks/:taskId/checklist body — CHECK-001 (PC-05).
//
// Only `content` is accepted: sortOrder is NOT client-controlled (the service
// appends at max(sortOrder)+1) and `completed` always starts false. Content is
// trimmed at the boundary and constrained to 1..500 chars
// (@db.VarChar(500) in the schema).
import { Transform } from 'class-transformer'
import { IsString, Length } from 'class-validator'

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

export class CreateChecklistItemDto {
  @IsString()
  @Length(1, 500)
  @Transform(trimString)
  content!: string
}
