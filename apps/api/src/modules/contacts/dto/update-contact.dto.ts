// PATCH /contacts/:id body — CONT-API-004 (PH-14, PC-01).
//
// Strict field-level allowlist: firstName, lastName, email, phone, role.
// `isPrimary` is NOT editable here — POST /contacts/:id/primary owns the
// primary transition (single enforcement point, CONT-001). clientId is
// immutable: a contact belongs to its client for its whole life.
// At least one field must be present — the service rejects an empty object
// with 400 VALIDATION_ERROR.
import { Transform } from 'class-transformer'
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator'
import { normalizeEmail } from '../../auth/utils/normalize-email'

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  @Transform(trimString)
  firstName?: string

  @IsOptional()
  @IsString()
  @Length(1, 100)
  @Transform(trimString)
  lastName?: string

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  email?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(trimString)
  phone?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(trimString)
  role?: string
}
