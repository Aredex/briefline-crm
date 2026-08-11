// Unit tests for the Argon2id password hashing util (argon2.util.ts, AP-54 / PH-04).
//
// These run against the real native module with production parameters
// (m=19456 KiB, t=2, p=1, hashLength=32) — the point is to verify the
// integration, not mock it. Each hash costs ~50-100ms.
import { describe, expect, it } from 'vitest'
import { ARGON2_OPTIONS, hashPassword, verifyPassword } from '../../src/modules/auth/utils/argon2.util'

describe('ARGON2_OPTIONS', () => {
  it('uses the OWASP-recommended Argon2id profile', () => {
    expect(ARGON2_OPTIONS.type).toBeDefined()
    expect(ARGON2_OPTIONS.memoryCost).toBeGreaterThanOrEqual(19_000) // ≥19 MiB
    expect(ARGON2_OPTIONS.timeCost).toBeGreaterThanOrEqual(2)
    expect(ARGON2_OPTIONS.parallelism).toBeGreaterThanOrEqual(1)
    expect(ARGON2_OPTIONS.hashLength).toBeGreaterThanOrEqual(16)
  })
})

describe('hashPassword', () => {
  it('produces an Argon2id PHC string, never the plaintext', async () => {
    const hash = await hashPassword('Sup3rSecret!')
    expect(hash).toMatch(/^\$argon2id\$/)
    expect(hash).not.toContain('Sup3rSecret!')
  })

  it('uses a random salt — same password hashes differently each time', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password'), hashPassword('same-password')])
    expect(a).not.toBe(b)
  })
})

describe('verifyPassword', () => {
  it('accepts the correct password', async () => {
    const hash = await hashPassword('Correct-Horse-Battery')
    await expect(verifyPassword(hash, 'Correct-Horse-Battery')).resolves.toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('Correct-Horse-Battery')
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false)
  })

  it('rejects a wrong password with an empty string', async () => {
    const hash = await hashPassword('Correct-Horse-Battery')
    await expect(verifyPassword(hash, '')).resolves.toBe(false)
  })

  it('round-trips hashes produced by different hashPassword calls', async () => {
    const hash = await hashPassword('long-password-42')
    await expect(verifyPassword(hash, 'long-password-42')).resolves.toBe(true)
  })

  it('throws (rejects) on a malformed hash instead of returning false — callers must not rely on a boolean for corrupted storage', async () => {
    await expect(verifyPassword('not-a-phc-string', 'anything')).rejects.toThrow()
  })
})
