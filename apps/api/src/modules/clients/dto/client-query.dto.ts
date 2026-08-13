// GET /clients query params — CLI-API-001 (PH-05, FR-CLI-001).
//
// page/limit are explicitly @Type-transformed (the global pipe runs with
// enableImplicitConversion: false — AP-51), so a non-numeric value fails
// validation with a 400 VALIDATION_ERROR instead of silently passing through.
// `q` searches companyName/contactName (case-insensitive, max 100 chars);
// `status` filters by ClientStatus — ARCHIVED rows are admin-only (BR-005) and
// the service enforces that per-actor.
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { ClientStatus } from '../../../generated/prisma/client'

export class ClientQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus
}
