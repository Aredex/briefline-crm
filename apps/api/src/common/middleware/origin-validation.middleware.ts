// Origin validation middleware — AUTH-003 (PH-04).
//
// Defense in depth alongside CSRF: unsafe methods (POST/PATCH/PUT/DELETE) are
// rejected when the request carries a cross-origin Origin header. Requests
// without an Origin header (curl, server-to-server, same-origin navigation)
// pass — AP-39. The allowlist comes from CORS_ORIGINS (comma-separated) and is
// compared via URL.origin, so a malicious Origin that merely *contains* an
// allowlisted host is rejected.
import { ForbiddenException, Injectable, type NestMiddleware } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { NextFunction, Request, Response } from 'express'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

@Injectable()
export class OriginValidationMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const method = req.method.toUpperCase()
    if (SAFE_METHODS.has(method)) {
      next()
      return
    }
    const origin = req.headers.origin
    if (!origin) {
      next()
      return
    }
    const allowlist = (this.configService.get<string>('CORS_ORIGINS') ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    try {
      const originUrl = new URL(origin)
      if (allowlist.includes(originUrl.origin)) {
        next()
        return
      }
    } catch {
      // Malformed Origin header — fall through to the rejection below.
    }
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      detail: 'Cross-origin requests are not allowed.',
    })
  }
}
