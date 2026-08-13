// PATCH /users/:id body — USR-003 (PH-04).
//
// Only name/role/status are admin-editable; passwordHash and email are NOT
// (password resets are out of scope for PH-04). At least one field must be
// present — the service rejects an empty object with 400 VALIDATION_ERROR.
import { Transform } from 'class-transformer'
import { IsEnum, IsOptional, IsString, Length } from 'class-validator'
import { UserRole, UserStatus } from '../../../generated/prisma/client'

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name?: string

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus
}
