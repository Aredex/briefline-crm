// Auth shared types — ADR-001.
import type { UserRole, UserStatus } from '../../generated/prisma/client'

/** Decoded JWT payload claims (verified by the strategy, ADR-001). */
export interface JwtPayload {
  sub: string // userId
  role: UserRole
  iat: number
  exp: number
}

/**
 * The authenticated user attached to req.user by the JWT strategy.
 * passwordHash is NEVER included (ADR-001.4 / D-19) — the strategy reloads
 * the user from the database on every request, so role/status are always
 * fresh (no stale-token role trust).
 */
export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
  status: UserStatus
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
}
