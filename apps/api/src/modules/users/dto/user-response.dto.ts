// User response shapes — USR-001..003 (PH-04).
//
// UserResponse NEVER carries passwordHash (PH-04 constraint, D-19/ADR-001.4).
// List endpoints wrap rows in the `{ data: UserResponse[], meta }` envelope.
import type { UserRole, UserStatus } from '../../../generated/prisma/client'

export interface UserResponse {
  id: string
  email: string
  name: string
  role: UserRole
  status: UserStatus
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface PageMeta {
  page: number
  limit: number
  total: number
}
