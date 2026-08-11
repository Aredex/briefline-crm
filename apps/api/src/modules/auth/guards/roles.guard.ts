// Global role guard — AUTH-002 (PH-04).
//
// Runs after JwtAuthGuard (APP_GUARD provider order). Routes without @Roles()
// metadata pass; routes with @Roles(...) require the CURRENT database role of
// the authenticated user (the strategy reloads the user per request, so role
// changes take effect immediately — AP-06, no stale-token role trust).
import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { UserRole } from '../../../../../../packages/api-contract/src/generated/prisma/client'
import type { AuthUser } from '../auth.types'
import { ROLES_KEY } from '../decorators/roles.decorator'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!requiredRoles || requiredRoles.length === 0) {
      return true
    }
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>()
    const user = request.user
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        detail: 'You do not have permission to perform this action.',
      })
    }
    return true
  }
}
