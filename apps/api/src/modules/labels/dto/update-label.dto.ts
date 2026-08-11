// PATCH /labels/:id body — LAB-001 (PC-04).
//
// Strict field-level allowlist: name and/or color. Both optional; at least one
// must be present — the service rejects an empty object with 400
// VALIDATION_ERROR (same guard as contacts, PH-14).
import { Transform } from 'class-transformer'
import { IsOptional, IsString, Length, Matches } from 'class-validator'
import { COLOR_PATTERN } from './create-label.dto'

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

export class UpdateLabelDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  @Transform(trimString)
  name?: string

  @IsOptional()
  @IsString()
  @Matches(COLOR_PATTERN, { message: 'color must be a #RRGGBB hex value (e.g. #6b7280).' })
  color?: string
}
