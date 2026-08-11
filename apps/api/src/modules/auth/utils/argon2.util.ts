// Argon2id password hashing — AP-54 (PH-04).
//
// OWASP-recommended Argon2id parameters: m=19456 KiB (19 MiB), t=2, p=1,
// hashLength=32. Output is a PHC string stored in User.passwordHash
// (VarChar(255)) — never plaintext, never logged.
import * as argon2 from 'argon2'

export const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
}

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS)
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain)
}
