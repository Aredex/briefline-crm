// Injects the authenticated user (set by the JWT strategy on every guarded
// request) into a handler parameter.
import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { AuthUser } from '../auth.types'

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>()
    return request.user
  },
)
