// Auth constants — ADR-001 (PH-04).
//
// The JWT lives in an HttpOnly cookie. Production uses the __Host- prefix
// (implies Secure + Path=/ + no Domain — validated by browsers); development
// and tests use the unprefixed name (ADR-001 decision, cookie name constant
// driven by NODE_ENV). The Bearer header remains a supported fallback for API
// clients that cannot manage cookies.
export const JWT_COOKIE_NAME_PRODUCTION = '__Host-briefline-token'
export const JWT_COOKIE_NAME_DEV = 'briefline-token'

export const JWT_TTL_SECONDS = 8 * 60 * 60 // 8h (ADR-001)
export const JWT_TTL_MS = JWT_TTL_SECONDS * 1000
export const JWT_ISSUER = 'briefline-api'
export const JWT_AUDIENCE = 'briefline-web'
export const JWT_ALGORITHM = 'HS256'

export function getJwtCookieName(nodeEnv: string): string {
  return nodeEnv === 'production' ? JWT_COOKIE_NAME_PRODUCTION : JWT_COOKIE_NAME_DEV
}

export const AUTH_COOKIE_OPTIONS = (isProduction: boolean): {
  httpOnly: boolean
  sameSite: 'lax'
  secure: boolean
  path: string
  maxAge?: number
} => ({
  httpOnly: true, // JS never reads the JWT (XSS containment, ADR-001)
  sameSite: 'lax',
  secure: isProduction,
  path: '/',
  maxAge: JWT_TTL_MS, // cookie lives as long as the token (8h, ADR-001)
})
