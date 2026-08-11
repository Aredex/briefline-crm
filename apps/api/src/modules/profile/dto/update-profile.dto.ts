// PATCH /profile body — PROF-001 (PH-04).
//
// ONLY `name` is editable by the profile owner. The global validation pipe
// (whitelist + forbidNonWhitelisted) turns any other field (email, role,
// status, passwordHash...) into a 400 VALIDATION_ERROR — mass assignment is
// structurally impossible (AP-52).
import { Transform } from 'class-transformer'
import { IsString, Length } from 'class-validator'

export class UpdateProfileDto {
  @IsString()
  @Length(2, 100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string
}
