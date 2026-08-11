// Public user shape for profile responses — never contains passwordHash (PH-04).
import type { UserRole, UserStatus } from '../../../../../packages/api-contract/src/generated/prisma/client'

export interface UserWithoutPassword {
  id: string
  email: string
  name: string
  role: UserRole
  status: UserStatus
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
}
