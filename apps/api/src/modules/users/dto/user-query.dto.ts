// GET /users query params — USR-001 (PH-04).
//
// page/limit are explicitly @Type-transformed (the global pipe runs with
// enableImplicitConversion: false — AP-51), so a non-numeric value fails
// validation with a 400 VALIDATION_ERROR instead of silently passing through.
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { UserRole, UserStatus } from '../../../../../../packages/api-contract/src/generated/prisma/client'

export class UserQueryDto {
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
  @IsEnum(UserRole)
  role?: UserRole

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus
}
