// Login response shape — AUTH-001 (PH-04).
//
// Successful login does NOT return the JWT: it is set as an HttpOnly cookie.
// The body carries the ROTATED CSRF token bound to the new session
// (openapi-and-errors.md — POST /auth/login 200 response).
export class LoginResponseDto {
  /** Fresh CSRF token for the authenticated session (echo via X-CSRF-Token). */
  csrfToken!: string
}
