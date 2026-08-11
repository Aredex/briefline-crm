// Unit tests for email normalization (normalize-email.ts, ADR-002 / PH-04).
//
// The unique identity of a user is the NORMALIZED email: trim().toLowerCase().
// Every email entering the system is normalized at the DTO boundary before
// validation/storage, so lookups always compare normalized values.
import { describe, expect, it } from 'vitest'
import { normalizeEmail } from '../../src/modules/auth/utils/normalize-email'

describe('normalizeEmail', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com')
    expect(normalizeEmail('\tuser@example.com\n')).toBe('user@example.com')
  })

  it('lowercases the local part and the domain', () => {
    expect(normalizeEmail('USER@Example.COM')).toBe('user@example.com')
  })

  it('combines trimming and lowercasing', () => {
    expect(normalizeEmail('  Jane.Doe@NorthStar.Digital  ')).toBe('jane.doe@northstar.digital')
  })

  it('leaves an already-normalized email unchanged', () => {
    expect(normalizeEmail('user@example.com')).toBe('user@example.com')
  })

  it('returns an empty string for a non-string input (class-transformer @Transform hands over unknown)', () => {
    // A non-string normalizes to '' and then fails IsEmail validation (400) — never crashes.
    expect(normalizeEmail(null)).toBe('')
    expect(normalizeEmail(undefined)).toBe('')
    expect(normalizeEmail(42)).toBe('')
    expect(normalizeEmail({ email: 'user@example.com' })).toBe('')
    expect(normalizeEmail(['user@example.com'])).toBe('')
  })

  it('returns an empty string for a blank string', () => {
    expect(normalizeEmail('')).toBe('')
    expect(normalizeEmail('   ')).toBe('')
  })
})
