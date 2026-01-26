/**
 * Data validation utilities for the Studio dashboard.
 * Provides validators for common data types.
 */

/**
 * Email validation regex pattern.
 * Validates common email formats.
 */
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

/**
 * UUID validation regex pattern.
 * Matches standard UUID format.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * URL validation regex pattern.
 */
const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i

/**
 * Validation result type.
 */
export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validate an email address.
 */
export function validateEmail(email: string): ValidationResult {
  if (!email || email.trim().length === 0) {
    return { valid: false, error: 'Email is required' }
  }

  if (!EMAIL_REGEX.test(email)) {
    return { valid: false, error: 'Invalid email format' }
  }

  return { valid: true }
}

/**
 * Validate a UUID string.
 */
export function validateUUID(uuid: string): ValidationResult {
  if (!uuid || uuid.trim().length === 0) {
    return { valid: false, error: 'UUID is required' }
  }

  if (!UUID_REGEX.test(uuid)) {
    return { valid: false, error: 'Invalid UUID format' }
  }

  return { valid: true }
}

/**
 * Validate a URL.
 */
export function validateURL(url: string): ValidationResult {
  if (!url || url.trim().length === 0) {
    return { valid: false, error: 'URL is required' }
  }

  if (!URL_REGEX.test(url)) {
    return { valid: false, error: 'Invalid URL format' }
  }

  return { valid: true }
}

/**
 * Validate that a value is within a numeric range.
 */
export function validateRange(
  value: number,
  min: number,
  max: number
): ValidationResult {
  if (typeof value !== 'number' || isNaN(value)) {
    return { valid: false, error: 'Value must be a number' }
  }

  if (value < min) {
    return { valid: false, error: `Value must be at least ${min}` }
  }

  if (value > max) {
    return { valid: false, error: `Value must be at most ${max}` }
  }

  return { valid: true }
}

/**
 * Validate string length.
 */
export function validateLength(
  value: string,
  minLength: number,
  maxLength: number
): ValidationResult {
  if (!value) {
    return { valid: false, error: 'Value is required' }
  }

  if (value.length < minLength) {
    return { valid: false, error: `Must be at least ${minLength} characters` }
  }

  if (value.length > maxLength) {
    return { valid: false, error: `Must be at most ${maxLength} characters` }
  }

  return { valid: true }
}

/**
 * Validate a password meets security requirements.
 */
export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { valid: false, error: 'Password is required' }
  }

  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' }
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain an uppercase letter' }
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain a lowercase letter' }
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain a number' }
  }

  return { valid: true }
}

/**
 * Format a number as currency.
 */
export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount)
}

/**
 * Round a number to specified decimal places.
 */
export function roundToDecimal(value: number, decimals: number): number {
  return Number(value.toFixed(decimals))
}

/**
 * Calculate percentage.
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0
  return roundToDecimal((value / total) * 100, 2)
}

/**
 * Safely parse a JSON string.
 */
export function safeParseJSON<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

/**
 * Check if a value is a valid JSON string.
 */
export function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str)
    return true
  } catch {
    return false
  }
}

/**
 * Validate a phone number.
 * Accepts various international formats.
 */
export function validatePhoneNumber(phone: string): ValidationResult {
  if (!phone || phone.trim().length === 0) {
    return { valid: false, error: 'Phone number is required' }
  }

  // Remove common formatting characters
  const cleaned = phone.replace(/[\s\-().]/g, '')

  // Check if it's a reasonable length
  if (cleaned.length < 7 || cleaned.length > 15) {
    return { valid: false, error: 'Invalid phone number length' }
  }

  // Check if it contains only valid characters
  if (!/^[+]?[0-9]+$/.test(cleaned)) {
    return { valid: false, error: 'Phone number contains invalid characters' }
  }

  return { valid: true }
}

/**
 * Validate a credit card number using Luhn algorithm.
 */
export function validateCreditCard(cardNumber: string): ValidationResult {
  const cleaned = cardNumber.replace(/\s|-/g, '')

  if (!/^\d{13,19}$/.test(cleaned)) {
    return { valid: false, error: 'Invalid card number format' }
  }

  // Luhn algorithm
  let sum = 0
  let isEven = false

  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i], 10)

    if (isEven) {
      digit *= 2
      if (digit > 9) {
        digit -= 9
      }
    }

    sum += digit
    isEven = !isEven
  }

  if (sum % 10 !== 0) {
    return { valid: false, error: 'Invalid card number' }
  }

  return { valid: true }
}

/**
 * Validate a date string.
 */
export function validateDateString(
  dateStr: string,
  format: 'iso' | 'us' | 'eu' = 'iso'
): ValidationResult {
  if (!dateStr) {
    return { valid: false, error: 'Date is required' }
  }

  let regex: RegExp
  switch (format) {
    case 'us':
      regex = /^\d{2}\/\d{2}\/\d{4}$/
      break
    case 'eu':
      regex = /^\d{2}\.\d{2}\.\d{4}$/
      break
    case 'iso':
    default:
      regex = /^\d{4}-\d{2}-\d{2}$/
  }

  if (!regex.test(dateStr)) {
    return { valid: false, error: 'Invalid date format' }
  }

  const date = new Date(dateStr)
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Invalid date' }
  }

  return { valid: true }
}

/**
 * Check if a string contains only alphanumeric characters.
 */
export function isAlphanumeric(str: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(str)
}

/**
 * Check if a string is a valid identifier (starts with letter, contains only letters, numbers, underscores).
 */
export function isValidIdentifier(str: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str)
}

/**
 * Sanitize a string for use in SQL identifiers.
 */
export function sanitizeIdentifier(str: string): string {
  return str.replace(/[^a-zA-Z0-9_]/g, '_')
}

/**
 * Validate IPv4 address.
 */
export function validateIPv4(ip: string): ValidationResult {
  const parts = ip.split('.')

  if (parts.length !== 4) {
    return { valid: false, error: 'Invalid IPv4 format' }
  }

  for (const part of parts) {
    const num = parseInt(part, 10)
    if (isNaN(num) || num < 0 || num > 255 || String(num) !== part) {
      return { valid: false, error: 'Invalid IPv4 address' }
    }
  }

  return { valid: true }
}

/**
 * Validate a semantic version string.
 */
export function validateSemVer(version: string): ValidationResult {
  const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

  if (!semverRegex.test(version)) {
    return { valid: false, error: 'Invalid semantic version format' }
  }

  return { valid: true }
}

/**
 * Compare two semantic versions.
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
export function compareSemVer(a: string, b: string): number {
  const parseVersion = (v: string) => {
    const [main] = v.split('-')
    return main.split('.').map(Number)
  }

  const [aMajor, aMinor, aPatch] = parseVersion(a)
  const [bMajor, bMinor, bPatch] = parseVersion(b)

  if (aMajor !== bMajor) return aMajor > bMajor ? 1 : -1
  if (aMinor !== bMinor) return aMinor > bMinor ? 1 : -1
  if (aPatch !== bPatch) return aPatch > bPatch ? 1 : -1

  return 0
}
