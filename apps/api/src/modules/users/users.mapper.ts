// User -> UserResponse mapper — USR-001..003 (PH-04).
//
// The single place where passwordHash is dropped from the DB row. Keeping the
// mapper explicit (instead of a pick in each service method) makes it
// auditable: any new response path that returns a user MUST go through it.
import type { User as PrismaUser } from '../../../../../packages/api-contract/src/generated/prisma/client'
import type { UserResponse } from './dto/user-response.dto'

export function toUserResponse(user: PrismaUser): UserResponse {
  // NUNCA expongas passwordHash en respuestas (PH-04 constraint).
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
