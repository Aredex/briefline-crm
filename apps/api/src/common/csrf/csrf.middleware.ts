// Global CSRF middleware — AUTH-003 (PH-04).
//
// Registered in AppModule.configure() AFTER OriginValidationMiddleware (R-5
// order: cookieParser → Origin → CSRF → guards → pipes). Unsafe methods
// (POST/PATCH/PUT/DELETE) require a valid X-CSRF-Token header; failures become
// 403 CSRF_INVALID Problem Details documents (the doubleCsrfProtection helper
// would answer with a bare JSON body instead, so validation runs here and the
// exception flows through the global ProblemDetailsFilter — RFC 9457 with
// traceId everywhere).
import { ForbiddenException, Injectable, Inject, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { CSRF_VALIDATE, type CsrfValidator } from './csrf.module'

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(@Inject(CSRF_VALIDATE) private readonly validateRequest: CsrfValidator) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const method = req.method.toUpperCase()
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      next()
      return
    }
    if (!this.validateRequest(req)) {
      throw new ForbiddenException({
        code: 'CSRF_INVALID',
        detail: 'The CSRF token is missing or invalid. Fetch a fresh token from GET /api/v1/auth/csrf and echo it in the X-CSRF-Token header.',
      })
    }
    next()
  }
}
