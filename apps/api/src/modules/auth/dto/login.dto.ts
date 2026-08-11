// Login request DTO — AUTH-001 (PH-04).
import { Transform } from 'class-transformer'
import { IsEmail, IsString, Length, MaxLength } from 'class-validator'
import { normalizeEmail } from '../utils/normalize-email'

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  email!: string

  @IsString()
  @Length(8, 72) // AP-53
  password!: string
}
