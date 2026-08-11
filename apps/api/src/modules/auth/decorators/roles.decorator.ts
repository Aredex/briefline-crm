// Role requirement marker for the global RolesGuard — AUTH-002.
import { SetMetadata } from '@nestjs/common'
import type { UserRole } from '../../../../../../packages/api-contract/src/generated/prisma/client'

export const ROLES_KEY = 'roles'
export const Roles = (...roles: UserRole[]): ReturnType<typeof SetMetadata> => SetMetadata(ROLES_KEY, roles)
