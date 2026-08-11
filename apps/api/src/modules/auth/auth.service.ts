// Auth service — AUTH-001 (PH-04, ADR-001, ADR-002).
//
// Login flow (constant-time behavior between unknown email / wrong password /
// inactive user is preserved by the generic INVALID_CREDENTIALS response):
//   1. normalize email (trim + lowercase, done by the DTO @Transform)
//   2. findUnique (schema is case-insensitive on email, ADR-002)
//   3. argon2id verify ONLY for ACTIVE users — inactive or unknown behave the
//      same, so user enumeration via login timing is not possible
//   4. sign HS256 JWT {sub, role} (8h, iss/aud pinned)
//   5. set HttpOnly cookie, then mutate req.cookies with the fresh JWT BEFORE
//      rotating the CSRF token so the new token binds to the new session
//      (csrf-csrf reads the session identifier from req.cookies)
//   6. update lastLoginAt (best-effort — a DB hiccup must not fail a login)
//
// All auth events are logged WITHOUT credentials, emails or tokens (API-005).
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Request, Response } from 'express'
import { CustomLogger } from '../../common/logger/custom.logger'
import { CSRF_GENERATE, type CsrfGenerator } from '../../common/csrf/csrf.module'
import { PrismaService } from '../../database/prisma.service'
import { AUTH_COOKIE_OPTIONS, JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, getJwtCookieName } from './auth.constants'
import type { AuthUser } from './auth.types'
import { verifyPassword } from './utils/argon2.util'
import type { LoginDto } from './dto/login.dto'

const INVALID_CREDENTIALS = {
  code: 'INVALID_CREDENTIALS',
  detail: 'Invalid email or password.',
}

@Injectable()
export class AuthService {
  private readonly logger = new CustomLogger('AuthService')

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(CSRF_GENERATE) private readonly generateCsrfToken: CsrfGenerator,
  ) {}

  async issueCsrfToken(req: Request, res: Response): Promise<string> {
    // Pre-auth rotation: identifier is 'anonymous' (no JWT cookie yet).
    return this.generateCsrfToken(req, res)
  }

  async login(dto: LoginDto, req: Request, res: Response): Promise<{ csrfToken: string; user: AuthUser }> {
    const nodeEnv = this.configService.getOrThrow<string>('NODE_ENV')
    const isProduction = nodeEnv === 'production'
    const cookieName = getJwtCookieName(nodeEnv)

    // Step 2-3: single generic error for unknown email, wrong password and
    // inactive accounts — no user enumeration (AP-07).
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (!user || user.status !== 'ACTIVE') {
      this.logger.warn('auth.login.failed', { reason: 'unknown_or_inactive' })
      throw new UnauthorizedException(INVALID_CREDENTIALS)
    }
    const passwordOk = await verifyPassword(user.passwordHash, dto.password)
    if (!passwordOk) {
      this.logger.warn('auth.login.failed', { reason: 'invalid_password' })
      throw new UnauthorizedException(INVALID_CREDENTIALS)
    }

    const token = await this.jwtService.signAsync(
      { sub: user.id, role: user.role },
      { algorithm: JWT_ALGORITHM, issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
    )
    res.cookie(cookieName, token, AUTH_COOKIE_OPTIONS(isProduction))
    // Bind the rotated CSRF token to the session cookie just created (step 5).
    req.cookies = { ...req.cookies, [cookieName]: token }
    const csrfToken = this.generateCsrfToken(req, res)

    // Best-effort lastLoginAt (step 6).
    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })
    } catch (error) {
      this.logger.warn('auth.login.lastLoginAt_failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      })
    }

    this.logger.log('auth.login.success', { event: 'auth.login.success', userId: user.id })
    return {
      csrfToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    }
  }

  async logout(req: Request, res: Response): Promise<{ ok: boolean }> {
    const nodeEnv = this.configService.getOrThrow<string>('NODE_ENV')
    const isProduction = nodeEnv === 'production'
    const cookieName = getJwtCookieName(nodeEnv)

    res.clearCookie(cookieName, AUTH_COOKIE_OPTIONS(isProduction))
    // Re-bind the CSRF token to the anonymous session ('anonymous' identifier).
    delete req.cookies[cookieName]
    this.generateCsrfToken(req, res)

    const user = (req as Request & { user?: AuthUser }).user
    this.logger.log('auth.logout.success', {
      event: 'auth.logout.success',
      userId: user?.id,
    })
    return { ok: true }
  }

  getCurrentUser(user: AuthUser): AuthUser {
    return user
  }
}
