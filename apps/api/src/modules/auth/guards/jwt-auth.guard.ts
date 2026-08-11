// Global JWT guard — AUTH-002 (PH-04).
//
// Registered as APP_GUARD, so authentication is opt-OUT (@Public) instead of
// opt-in (AP-01). @Public() endpoints skip authentication entirely. When the
// strategy rejects a request, passport hands back (err, user, info):
//   - expired token  -> info.name === 'TokenExpiredError' -> 401 TOKEN_EXPIRED
//   - anything else  -> 401 TOKEN_INVALID
// Strategy-thrown errors (e.g. INACTIVE_USER) rethrow as-is.
import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import type { Observable } from 'rxjs'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super()
  }

  override canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) {
      return true
    }
    return super.canActivate(context)
  }

  override handleRequest<TUser = unknown>(err: unknown, user: TUser, info: unknown): TUser {
    if (err) {
      throw err
    }
    if (!user) {
      const expired = (info as { name?: string } | null | undefined)?.name === 'TokenExpiredError'
      throw new UnauthorizedException(
        expired
          ? { code: 'TOKEN_EXPIRED', detail: 'The session token has expired. Please log in again.' }
          : { code: 'TOKEN_INVALID', detail: 'The session token is invalid. Please log in again.' },
      )
    }
    return user
  }
}
