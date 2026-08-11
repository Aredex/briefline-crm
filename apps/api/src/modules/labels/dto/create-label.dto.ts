// POST /labels body — LAB-001 (PC-04).
//
// `name` is required (trimmed, 1..50 chars, @db.VarChar(50)); `color` is
// optional and defaults to '#6b7280' at the schema level when absent — but
// whenever present it MUST be a #RRGGBB hex value (regex-enforced here, so a
// malformed color is a 400 VALIDATION_ERROR, never a bad row). The catalogue
// unique index on name turns duplicates into 409 LABEL_NAME_EXISTS (service).
import { Transform } from 'class-transformer'
import { IsOptional, IsString, Length, Matches } from 'class-validator'

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

// LAB-001: colors are always #RRGGBB — six hex digits, case-insensitive.
export const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

export class CreateLabelDto {
  @IsString()
  @Length(1, 50)
  @Transform(trimString)
  name!: string

  @IsOptional()
  @IsString()
  @Matches(COLOR_PATTERN, { message: 'color must be a #RRGGBB hex value (e.g. #6b7280).' })
  color?: string
}
