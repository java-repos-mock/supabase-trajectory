import { describe, it, expect } from 'vitest'
import {
  validateEmail,
  validateUUID,
  validateURL,
  validateRange,
  validateLength,
  validatePassword,
  formatCurrency,
  roundToDecimal,
  calculatePercentage,
  safeParseJSON,
  isValidJSON,
  validatePhoneNumber,
  validateCreditCard,
  validateDateString,
  isAlphanumeric,
  isValidIdentifier,
  sanitizeIdentifier,
  validateIPv4,
  validateSemVer,
  compareSemVer,
} from './validation-utils'

describe('validation-utils', () => {
  describe('validateEmail', () => {
    it('accepts valid emails', () => {
      expect(validateEmail('user@example.com').valid).toBe(true)
      expect(validateEmail('user.name@example.com').valid).toBe(true)
      expect(validateEmail('user@subdomain.example.com').valid).toBe(true)
    })

    it('rejects invalid emails', () => {
      expect(validateEmail('').valid).toBe(false)
      expect(validateEmail('invalid').valid).toBe(false)
      expect(validateEmail('@example.com').valid).toBe(false)
    })
  })

  describe('validateUUID', () => {
    it('accepts valid UUIDs', () => {
      expect(validateUUID('123e4567-e89b-12d3-a456-426614174000').valid).toBe(true)
      expect(validateUUID('550e8400-e29b-41d4-a716-446655440000').valid).toBe(true)
    })

    it('rejects invalid UUIDs', () => {
      expect(validateUUID('').valid).toBe(false)
      expect(validateUUID('not-a-uuid').valid).toBe(false)
      expect(validateUUID('123e4567-e89b-12d3-a456').valid).toBe(false)
    })
  })

  describe('validateURL', () => {
    it('accepts valid URLs', () => {
      expect(validateURL('https://example.com').valid).toBe(true)
      expect(validateURL('http://example.com/path').valid).toBe(true)
      expect(validateURL('https://sub.example.com:8080/path?query=1').valid).toBe(true)
    })

    it('rejects invalid URLs', () => {
      expect(validateURL('').valid).toBe(false)
      expect(validateURL('not-a-url').valid).toBe(false)
      expect(validateURL('ftp://example.com').valid).toBe(false)
    })
  })

  describe('validateRange', () => {
    it('accepts values in range', () => {
      expect(validateRange(5, 1, 10).valid).toBe(true)
      expect(validateRange(1, 1, 10).valid).toBe(true)
      expect(validateRange(10, 1, 10).valid).toBe(true)
    })

    it('rejects values out of range', () => {
      expect(validateRange(0, 1, 10).valid).toBe(false)
      expect(validateRange(11, 1, 10).valid).toBe(false)
    })
  })

  describe('validateLength', () => {
    it('accepts strings of valid length', () => {
      expect(validateLength('hello', 1, 10).valid).toBe(true)
      expect(validateLength('hi', 2, 5).valid).toBe(true)
    })

    it('rejects strings of invalid length', () => {
      expect(validateLength('', 1, 10).valid).toBe(false)
      expect(validateLength('hello world', 1, 5).valid).toBe(false)
    })
  })

  describe('validatePassword', () => {
    it('accepts strong passwords', () => {
      expect(validatePassword('Password123').valid).toBe(true)
      expect(validatePassword('MySecure1Pass').valid).toBe(true)
    })

    it('rejects weak passwords', () => {
      expect(validatePassword('').valid).toBe(false)
      expect(validatePassword('short').valid).toBe(false)
      expect(validatePassword('alllowercase').valid).toBe(false)
      expect(validatePassword('ALLUPPERCASE').valid).toBe(false)
      expect(validatePassword('NoNumbers').valid).toBe(false)
    })
  })

  describe('formatCurrency', () => {
    it('formats USD', () => {
      expect(formatCurrency(1234.56)).toMatch(/\$1,234\.56/)
    })

    it('formats other currencies', () => {
      expect(formatCurrency(1234.56, 'EUR', 'de-DE')).toContain('€')
    })
  })

  describe('roundToDecimal', () => {
    it('rounds to specified decimals', () => {
      expect(roundToDecimal(3.14159, 2)).toBe(3.14)
      expect(roundToDecimal(3.14559, 2)).toBe(3.15)
      expect(roundToDecimal(3.5, 0)).toBe(4)
    })
  })

  describe('calculatePercentage', () => {
    it('calculates percentage', () => {
      expect(calculatePercentage(25, 100)).toBe(25)
      expect(calculatePercentage(1, 3)).toBeCloseTo(33.33, 2)
    })

    it('handles zero total', () => {
      expect(calculatePercentage(10, 0)).toBe(0)
    })
  })

  describe('safeParseJSON', () => {
    it('parses valid JSON', () => {
      expect(safeParseJSON('{"a": 1}', {})).toEqual({ a: 1 })
    })

    it('returns fallback for invalid JSON', () => {
      expect(safeParseJSON('invalid', { default: true })).toEqual({ default: true })
    })
  })

  describe('isValidJSON', () => {
    it('returns true for valid JSON', () => {
      expect(isValidJSON('{"a": 1}')).toBe(true)
      expect(isValidJSON('[1, 2, 3]')).toBe(true)
    })

    it('returns false for invalid JSON', () => {
      expect(isValidJSON('invalid')).toBe(false)
      expect(isValidJSON('{a: 1}')).toBe(false)
    })
  })

  describe('validatePhoneNumber', () => {
    it('accepts valid phone numbers', () => {
      expect(validatePhoneNumber('+1-555-123-4567').valid).toBe(true)
      expect(validatePhoneNumber('555-123-4567').valid).toBe(true)
      expect(validatePhoneNumber('(555) 123-4567').valid).toBe(true)
    })

    it('rejects invalid phone numbers', () => {
      expect(validatePhoneNumber('').valid).toBe(false)
      expect(validatePhoneNumber('abc').valid).toBe(false)
      expect(validatePhoneNumber('123').valid).toBe(false)
    })
  })

  describe('validateCreditCard', () => {
    it('validates correct Luhn numbers', () => {
      expect(validateCreditCard('4532015112830366').valid).toBe(true)
      expect(validateCreditCard('4916338506082832').valid).toBe(true)
    })

    it('rejects invalid card numbers', () => {
      expect(validateCreditCard('1234567890123456').valid).toBe(false)
      expect(validateCreditCard('invalid').valid).toBe(false)
    })
  })

  describe('validateDateString', () => {
    it('validates ISO format', () => {
      expect(validateDateString('2024-01-15', 'iso').valid).toBe(true)
    })

    it('validates US format', () => {
      expect(validateDateString('01/15/2024', 'us').valid).toBe(true)
    })

    it('validates EU format', () => {
      expect(validateDateString('15.01.2024', 'eu').valid).toBe(true)
    })

    it('rejects invalid dates', () => {
      expect(validateDateString('', 'iso').valid).toBe(false)
      expect(validateDateString('2024/01/15', 'iso').valid).toBe(false)
    })
  })

  describe('isAlphanumeric', () => {
    it('returns true for alphanumeric strings', () => {
      expect(isAlphanumeric('abc123')).toBe(true)
      expect(isAlphanumeric('ABC')).toBe(true)
    })

    it('returns false for non-alphanumeric strings', () => {
      expect(isAlphanumeric('abc 123')).toBe(false)
      expect(isAlphanumeric('abc-123')).toBe(false)
    })
  })

  describe('isValidIdentifier', () => {
    it('accepts valid identifiers', () => {
      expect(isValidIdentifier('myVar')).toBe(true)
      expect(isValidIdentifier('_private')).toBe(true)
      expect(isValidIdentifier('my_var_2')).toBe(true)
    })

    it('rejects invalid identifiers', () => {
      expect(isValidIdentifier('123abc')).toBe(false)
      expect(isValidIdentifier('my-var')).toBe(false)
    })
  })

  describe('sanitizeIdentifier', () => {
    it('replaces invalid characters', () => {
      expect(sanitizeIdentifier('my-var')).toBe('my_var')
      expect(sanitizeIdentifier('my var!')).toBe('my_var_')
    })
  })

  describe('validateIPv4', () => {
    it('accepts valid IPv4 addresses', () => {
      expect(validateIPv4('192.168.1.1').valid).toBe(true)
      expect(validateIPv4('0.0.0.0').valid).toBe(true)
      expect(validateIPv4('255.255.255.255').valid).toBe(true)
    })

    it('rejects invalid IPv4 addresses', () => {
      expect(validateIPv4('256.1.1.1').valid).toBe(false)
      expect(validateIPv4('1.1.1').valid).toBe(false)
      expect(validateIPv4('not.an.ip.address').valid).toBe(false)
    })
  })

  describe('validateSemVer', () => {
    it('accepts valid semantic versions', () => {
      expect(validateSemVer('1.0.0').valid).toBe(true)
      expect(validateSemVer('1.2.3-beta').valid).toBe(true)
      expect(validateSemVer('1.2.3+build').valid).toBe(true)
    })

    it('rejects invalid versions', () => {
      expect(validateSemVer('1.0').valid).toBe(false)
      expect(validateSemVer('v1.0.0').valid).toBe(false)
    })
  })

  describe('compareSemVer', () => {
    it('compares versions correctly', () => {
      expect(compareSemVer('1.0.0', '1.0.0')).toBe(0)
      expect(compareSemVer('1.0.0', '2.0.0')).toBe(-1)
      expect(compareSemVer('2.0.0', '1.0.0')).toBe(1)
      expect(compareSemVer('1.1.0', '1.0.0')).toBe(1)
      expect(compareSemVer('1.0.1', '1.0.0')).toBe(1)
    })
  })
})
