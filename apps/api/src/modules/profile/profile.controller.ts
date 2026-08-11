// Profile controller — PROF-001 (PH-04).
//   GET   /api/v1/profile -> current user (JWT)
//   PATCH /api/v1/profile -> update own `name` (JWT, strict whitelist)
import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import type { AuthUser } from '../auth/auth.types'
import { ProfileService } from './profile.service'
import type { UserWithoutPassword } from './profile.types'
import { UpdateProfileDto } from './dto/update-profile.dto'

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getProfile(@CurrentUser() user: AuthUser): Promise<{ data: UserWithoutPassword }> {
    return { data: await this.profileService.getProfile(user.id) }
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<{ data: UserWithoutPassword }> {
    return { data: await this.profileService.updateProfile(user.id, dto) }
  }
}
