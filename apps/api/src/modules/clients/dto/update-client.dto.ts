// PATCH /clients/:id body — CLI-API-004 (PH-05, FR-CLI-004).
//
// Strict field-level allowlist: companyName, industry, contactName,
// contactEmail, phone, notes. `status` is NOT editable here — the dedicated
// deactivate/archive endpoints own status transitions (CLI-API-005).
// At least one field must be present — the service rejects an empty object
// with 400 VALIDATION_ERROR.
import { Transform } from 'class-transformer'
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator'
import { normalizeEmail } from '../../auth/utils/normalize-email'

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  @Transform(trimString)
  companyName?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(trimString)
  industry?: string

  @IsOptional()
  @IsString()
  @Length(1, 100)
  @Transform(trimString)
  contactName?: string

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  contactEmail?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(trimString)
  phone?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trimString)
  notes?: string
}
