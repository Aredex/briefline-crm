// POST /users body — USR-002 (PH-04).
//
// Email is normalized (trim + lowercase, ADR-002) by the DTO transform, the
// initial password follows AP-53 (8-72 chars) and is hashed with Argon2id
// before persistence. role/status default to MEMBER/ACTIVE.
import { Transform } from 'class-transformer'
import { IsEmail, IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator'
import { UserRole, UserStatus } from '../../../generated/prisma/client'
import { normalizeEmail } from '../../auth/utils/normalize-email'

export class CreateUserDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  email!: string

  @IsString()
  @Length(2, 100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string

  @IsString()
  @Length(8, 72) // AP-53
  password!: string

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus
}
