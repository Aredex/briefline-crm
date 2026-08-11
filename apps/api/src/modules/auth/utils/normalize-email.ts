// Email normalization — ADR-002 (PH-04).
//
// The unique identity of a user is the NORMALIZED email: trim().toLowerCase().
// Every email entering the system (login, user creation, client contact) is
// normalized at the DTO boundary before validation/storage, and lookups always
// use the normalized value.
export function normalizeEmail(email: unknown): string {
  // class-transformer @Transform hands over `unknown`; a non-string input
  // normalizes to '' and then fails IsEmail validation (400) — never crashes.
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}
