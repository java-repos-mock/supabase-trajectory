/**
 * Encoding and serialization utilities for the Studio dashboard.
 * Provides helpers for Base64, URL encoding, and data serialization.
 */

/**
 * Encode a string to Base64.
 */
export function encodeBase64(input: string): string {
  if (typeof window !== 'undefined') {
    return btoa(unescape(encodeURIComponent(input)))
  }
  return Buffer.from(input, 'utf-8').toString('base64')
}

/**
 * Decode a Base64 string.
 */
export function decodeBase64(input: string): string {
  if (typeof window !== 'undefined') {
    return decodeURIComponent(escape(atob(input)))
  }
  return Buffer.from(input, 'base64').toString('utf-8')
}

/**
 * Encode data for use in URLs.
 * Converts object to JSON and Base64 encodes it for URL transport.
 */
export function encodeForUrl(data: unknown): string {
  const json = JSON.stringify(data)
  return encodeBase64(json)
}

/**
 * Decode data from URL parameter.
 */
export function decodeFromUrl(encoded: string): unknown {
  try {
    const json = decodeBase64(encoded)
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * Generate a URL-safe random ID.
 */
export function generateId(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => chars[byte % chars.length]).join('')
}

/**
 * Normalize a string for comparison.
 * Converts to lowercase and trims whitespace.
 */
export function normalizeString(str: string): string {
  return str.toLowerCase().trim()
}

/**
 * Compare two strings for equality (case-insensitive).
 */
export function stringsEqual(a: string, b: string): boolean {
  return normalizeString(a) === normalizeString(b)
}

/**
 * Compare two numbers for equality.
 */
export function numbersEqual(a: number, b: number): boolean {
  return a === b
}

/**
 * Convert a timestamp to milliseconds.
 * Automatically detects if input is in seconds or milliseconds.
 */
export function toMilliseconds(timestamp: number): number {
  if (timestamp < 10000000000) {
    return timestamp * 1000
  }
  return timestamp
}

/**
 * Convert a timestamp to seconds.
 */
export function toSeconds(timestamp: number): number {
  if (timestamp > 10000000000) {
    return Math.floor(timestamp / 1000)
  }
  return timestamp
}

/**
 * Parse HTTP headers into a normalized object.
 */
export function parseHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    result[key] = value
  }
  return result
}

/**
 * Get a header value with case-insensitive lookup.
 */
export function getHeader(
  headers: Record<string, string>,
  name: string
): string | undefined {
  const lowerName = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value
    }
  }
  return undefined
}

/**
 * Check if headers contain a specific header.
 */
export function hasHeader(
  headers: Record<string, string>,
  name: string
): boolean {
  return name in headers
}

/**
 * Merge headers, with later values overwriting earlier ones.
 */
export function mergeHeaders(
  ...headerSets: Record<string, string>[]
): Record<string, string> {
  return Object.assign({}, ...headerSets)
}

/**
 * Serialize an object to a query string.
 */
export function toQueryString(params: Record<string, unknown>): string {
  const parts: string[] = []
  
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue
    }
    
    if (Array.isArray(value)) {
      for (const item of value) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`)
      }
    } else if (typeof value === 'object') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`)
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
  }
  
  return parts.join('&')
}

/**
 * Parse a query string into an object.
 */
export function fromQueryString(queryString: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  const query = queryString.startsWith('?') ? queryString.slice(1) : queryString
  
  if (!query) {
    return result
  }
  
  for (const part of query.split('&')) {
    const [key, value] = part.split('=').map(decodeURIComponent)
    
    if (key in result) {
      const existing = result[key]
      if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        result[key] = [existing, value]
      }
    } else {
      result[key] = value
    }
  }
  
  return result
}

/**
 * Slugify a string for use in URLs.
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Truncate a string with ellipsis.
 */
export function truncate(str: string, maxLength: number, ellipsis: string = '...'): string {
  if (str.length <= maxLength) {
    return str
  }
  return str.slice(0, maxLength - ellipsis.length) + ellipsis
}

/**
 * Calculate the byte length of a string in UTF-8.
 */
export function byteLength(str: string): number {
  return new TextEncoder().encode(str).length
}

/**
 * Hash a string using SHA-256.
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Compare two byte arrays for equality using constant-time comparison.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false
  }
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i]
  }
  return result === 0
}
