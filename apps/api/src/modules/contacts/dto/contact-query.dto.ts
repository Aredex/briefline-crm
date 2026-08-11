// GET /contacts query params — CONT-API-002 (PH-14, PC-01).
//
// page/limit are explicitly @Type-transformed (the global pipe runs with
// enableImplicitConversion: false — AP-51), so a non-numeric value fails
// validation with a 400 VALIDATION_ERROR instead of silently passing through.
// `q` searches firstName/lastName/email (case-insensitive, max 100 chars);
// `clientId` filters by client (UUID); `isPrimary` filters the primary flag
// (must be exactly 'true'/'false' — anything else fails IsBoolean).
import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator'

export class ContactQueryDto {
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
  @IsUUID()
  clientId?: string

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' || value === 'false' ? value === 'true' : value,
  )
  @IsBoolean()
  isPrimary?: boolean
}
