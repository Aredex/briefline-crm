// CSRF — signed double-submit (csrf-csrf 4.0.3) — AUTH-003 (PH-04).
//
// The cookie `csrf-token` holds the signed token; unsafe requests must echo it
// in the X-CSRF-Token header (getCsrfTokenFromRequest default). The token is
// bound to the session via getSessionIdentifier — the JWT cookie VALUE — so a
// token stolen from one session is useless in another (and pre-login tokens
// are only valid while the session is anonymous).
import { doubleCsrf, type DoubleCsrfUtilities } from 'csrf-csrf'
import type { ConfigService } from '@nestjs/config'
import { getJwtCookieName } from '../../modules/auth/auth.constants'

export interface CsrfApi extends DoubleCsrfUtilities {}

export function initCsrf(configService: Pick<ConfigService, 'getOrThrow'>): CsrfApi {
  const nodeEnv = configService.getOrThrow<string>('NODE_ENV')
  const isProduction = nodeEnv === 'production'
  return doubleCsrf({
    getSecret: () => configService.getOrThrow<string>('CSRF_SECRET'),
    getSessionIdentifier: (req) =>
      (req as unknown as { cookies?: Record<string, string> }).cookies?.[getJwtCookieName(nodeEnv)] ?? 'anonymous',
    cookieName: 'csrf-token',
    // AP-40: no __Host- prefix on the CSRF cookie (it is double-submitted and
    // read by JS to echo in the header).
    cookieOptions: {
      sameSite: 'strict',
      path: '/',
      secure: isProduction,
      httpOnly: true,
    },
    size: 32,
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  })
}
