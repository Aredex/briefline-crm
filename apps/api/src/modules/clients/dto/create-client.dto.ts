// POST /clients body — CLI-API-002 (PH-05, FR-CLI-003).
//
// Any active user may create a client (BR-006); the creator is recorded by the
// service from the authenticated user (never accepted from the body).
// Length limits follow the PRD/OpenAPI contract: companyName 160, industry 80,
// contactName 100, contactEmail 254, phone 32, notes 2000.
// contactEmail is normalized (trim + lowercase, ADR-002) by the DTO transform —
// the same invariant as User.email (D-16).
import { Transform } from 'class-transformer'
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator'
import { normalizeEmail } from '../../auth/utils/normalize-email'

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

export class CreateClientDto {
  @IsString()
  @Length(1, 160)
  @Transform(trimString)
  companyName!: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(trimString)
  industry?: string

  @IsString()
  @Length(1, 100)
  @Transform(trimString)
  contactName!: string

  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  contactEmail!: string

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
