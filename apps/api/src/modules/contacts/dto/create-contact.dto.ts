// POST /contacts body — CONT-API-001 (PH-14, PC-01).
//
// ADMIN-only (controller @Roles). firstName/lastName are required; email is
// optional but must be a valid address and is normalized (trim + lowercase,
// ADR-002 — same invariant as User.email, D-16). `isPrimary` is NOT accepted
// here: primary status is a state transition owned by POST /contacts/:id/primary
// (single enforcement point for the one-primary-per-client invariant).
import { Transform } from 'class-transformer'
import { IsEmail, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator'
import { normalizeEmail } from '../../auth/utils/normalize-email'

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

export class CreateContactDto {
  @IsUUID()
  clientId!: string

  @IsString()
  @Length(1, 100)
  @Transform(trimString)
  firstName!: string

  @IsString()
  @Length(1, 100)
  @Transform(trimString)
  lastName!: string

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
