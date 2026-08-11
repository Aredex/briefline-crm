// JWT strategy — AUTH-001/AUTH-002 (PH-04, ADR-001).
//
// Token extraction order: HttpOnly cookie first, Bearer header as fallback for
// API clients. Verification pins HS256 + issuer + audience + expiration
// (passport-jwt options). Every request reloads the user from the database and
// requires status ACTIVE — expired/invalid sessions 401 at the guard, and
// deactivated users lose access immediately (no stale-token trust).
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import type { Request } from 'express'
import { PrismaService } from '../../../database/prisma.service'
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, getJwtCookieName } from '../auth.constants'
import type { AuthUser, JwtPayload } from '../auth.types'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const nodeEnv = configService.getOrThrow<string>('NODE_ENV')
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request): string | null =>
          request?.cookies?.[getJwtCookieName(nodeEnv)] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    })
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException({
        code: 'INACTIVE_USER',
        detail: 'The session is no longer valid. Please log in again.',
      })
    }
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
}
