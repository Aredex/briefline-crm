// POST /tasks/:taskId/comments body — COMM-001 (PC-03).
//
// Only `content` is accepted. The author is NEVER accepted from the body —
// the authenticated actor (JWT) is recorded by the service (same invariant as
// tasks/creatorId and contacts/clientId). Content is trimmed at the boundary
// and constrained to 1..2000 chars (@db.VarChar(2000) in the schema).
import { Transform } from 'class-transformer'
import { IsString, Length } from 'class-validator'

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

export class CreateCommentDto {
  @IsString()
  @Length(1, 2000)
  @Transform(trimString)
  content!: string
}
