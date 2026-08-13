// Profile service — PROF-001 (PH-04).
//
// The profile endpoints always resolve the user from the AUTHENTICATED session
// (JWT sub -> fresh DB row per request), never from client-supplied ids — the
// resource is implicitly scoped to the requester (AP-05).
import { Injectable, NotFoundException } from '@nestjs/common'
import type { User as PrismaUser } from '../../generated/prisma/client'
import { PrismaService } from '../../database/prisma.service'
import type { UserWithoutPassword } from './profile.types'
import type { UpdateProfileDto } from './dto/update-profile.dto'

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<UserWithoutPassword> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        detail: 'User not found.',
      })
    }
    return toProfileResponse(user)
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserWithoutPassword> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name },
    })
    return toProfileResponse(user)
  }
}

function toProfileResponse(user: PrismaUser): UserWithoutPassword {
  // NUNCA exponer passwordHash en respuestas (PH-04 constraint).
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}
