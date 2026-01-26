import { describe, it, expect } from 'vitest'
import {
  encodeBase64,
  decodeBase64,
  encodeForUrl,
  decodeFromUrl,
  generateId,
  normalizeString,
  stringsEqual,
  numbersEqual,
  toMilliseconds,
  toSeconds,
  parseHeaders,
  getHeader,
  hasHeader,
  mergeHeaders,
  toQueryString,
  fromQueryString,
  slugify,
  truncate,
  byteLength,
  sha256,
  constantTimeEqual,
} from './encoding-utils'

describe('encoding-utils', () => {
  describe('encodeBase64/decodeBase64', () => {
    it('encodes and decodes ASCII strings', () => {
      const input = 'Hello, World!'
      const encoded = encodeBase64(input)
      expect(decodeBase64(encoded)).toBe(input)
    })

    it('handles unicode strings', () => {
      const input = '你好世界'
      const encoded = encodeBase64(input)
      expect(decodeBase64(encoded)).toBe(input)
    })

    it('handles empty strings', () => {
      expect(encodeBase64('')).toBe('')
      expect(decodeBase64('')).toBe('')
    })
  })

  describe('encodeForUrl/decodeFromUrl', () => {
    it('encodes objects for URL transport', () => {
      const data = { name: 'test', count: 42 }
      const encoded = encodeForUrl(data)
      expect(decodeFromUrl(encoded)).toEqual(data)
    })

    it('handles arrays', () => {
      const data = [1, 2, 3]
      const encoded = encodeForUrl(data)
      expect(decodeFromUrl(encoded)).toEqual(data)
    })

    it('returns null for invalid encoded data', () => {
      expect(decodeFromUrl('invalid-base64!!')).toBeNull()
    })
  })

  describe('generateId', () => {
    it('generates IDs of specified length', () => {
      expect(generateId(8).length).toBe(8)
      expect(generateId(16).length).toBe(16)
      expect(generateId(32).length).toBe(32)
    })

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()))
      expect(ids.size).toBe(100)
    })

    it('generates URL-safe characters only', () => {
      const id = generateId(100)
      expect(id).toMatch(/^[A-Za-z0-9]+$/)
    })
  })

  describe('normalizeString', () => {
    it('converts to lowercase', () => {
      expect(normalizeString('HELLO')).toBe('hello')
    })

    it('trims whitespace', () => {
      expect(normalizeString('  hello  ')).toBe('hello')
    })
  })

  describe('stringsEqual', () => {
    it('compares case-insensitively', () => {
      expect(stringsEqual('Hello', 'hello')).toBe(true)
      expect(stringsEqual('WORLD', 'world')).toBe(true)
    })

    it('returns false for different strings', () => {
      expect(stringsEqual('hello', 'world')).toBe(false)
    })
  })

  describe('numbersEqual', () => {
    it('compares integers', () => {
      expect(numbersEqual(42, 42)).toBe(true)
      expect(numbersEqual(42, 43)).toBe(false)
    })

    it('compares floating point numbers', () => {
      expect(numbersEqual(3.14, 3.14)).toBe(true)
    })
  })

  describe('toMilliseconds/toSeconds', () => {
    it('converts seconds to milliseconds', () => {
      expect(toMilliseconds(1609459200)).toBe(1609459200000)
    })

    it('keeps milliseconds as-is', () => {
      expect(toMilliseconds(1609459200000)).toBe(1609459200000)
    })

    it('converts milliseconds to seconds', () => {
      expect(toSeconds(1609459200000)).toBe(1609459200)
    })

    it('keeps seconds as-is', () => {
      expect(toSeconds(1609459200)).toBe(1609459200)
    })
  })

  describe('parseHeaders', () => {
    it('parses headers object', () => {
      const headers = { 'Content-Type': 'application/json' }
      expect(parseHeaders(headers)).toEqual(headers)
    })
  })

  describe('getHeader', () => {
    it('gets header case-insensitively', () => {
      const headers = { 'Content-Type': 'application/json' }
      expect(getHeader(headers, 'content-type')).toBe('application/json')
      expect(getHeader(headers, 'CONTENT-TYPE')).toBe('application/json')
    })

    it('returns undefined for missing headers', () => {
      expect(getHeader({}, 'Content-Type')).toBeUndefined()
    })
  })

  describe('hasHeader', () => {
    it('checks for header presence', () => {
      const headers = { 'Content-Type': 'application/json' }
      expect(hasHeader(headers, 'Content-Type')).toBe(true)
    })
  })

  describe('mergeHeaders', () => {
    it('merges multiple header objects', () => {
      const a = { 'Content-Type': 'application/json' }
      const b = { 'Authorization': 'Bearer token' }
      expect(mergeHeaders(a, b)).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token',
      })
    })

    it('later values overwrite earlier ones', () => {
      const a = { 'Content-Type': 'text/plain' }
      const b = { 'Content-Type': 'application/json' }
      expect(mergeHeaders(a, b)['Content-Type']).toBe('application/json')
    })
  })

  describe('toQueryString', () => {
    it('serializes simple objects', () => {
      expect(toQueryString({ a: 1, b: 2 })).toBe('a=1&b=2')
    })

    it('handles arrays', () => {
      expect(toQueryString({ tags: ['a', 'b'] })).toBe('tags=a&tags=b')
    })

    it('skips null and undefined', () => {
      expect(toQueryString({ a: 1, b: null, c: undefined })).toBe('a=1')
    })

    it('encodes special characters', () => {
      expect(toQueryString({ q: 'hello world' })).toBe('q=hello%20world')
    })
  })

  describe('fromQueryString', () => {
    it('parses simple query strings', () => {
      expect(fromQueryString('a=1&b=2')).toEqual({ a: '1', b: '2' })
    })

    it('handles leading ?', () => {
      expect(fromQueryString('?a=1')).toEqual({ a: '1' })
    })

    it('handles repeated keys as arrays', () => {
      expect(fromQueryString('a=1&a=2')).toEqual({ a: ['1', '2'] })
    })
  })

  describe('slugify', () => {
    it('converts to lowercase', () => {
      expect(slugify('Hello World')).toBe('hello-world')
    })

    it('removes special characters', () => {
      expect(slugify('Hello, World!')).toBe('hello-world')
    })

    it('handles multiple spaces', () => {
      expect(slugify('hello   world')).toBe('hello-world')
    })
  })

  describe('truncate', () => {
    it('truncates long strings', () => {
      expect(truncate('Hello, World!', 10)).toBe('Hello, ...')
    })

    it('keeps short strings unchanged', () => {
      expect(truncate('Hello', 10)).toBe('Hello')
    })

    it('uses custom ellipsis', () => {
      expect(truncate('Hello, World!', 10, '…')).toBe('Hello, Wo…')
    })
  })

  describe('byteLength', () => {
    it('calculates ASCII string length', () => {
      expect(byteLength('hello')).toBe(5)
    })

    it('calculates UTF-8 length for unicode', () => {
      expect(byteLength('你好')).toBe(6)
    })
  })

  describe('sha256', () => {
    it('hashes strings', async () => {
      const hash = await sha256('hello')
      expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
    })
  })

  describe('constantTimeEqual', () => {
    it('returns true for equal arrays', () => {
      const a = new Uint8Array([1, 2, 3])
      const b = new Uint8Array([1, 2, 3])
      expect(constantTimeEqual(a, b)).toBe(true)
    })

    it('returns false for different arrays', () => {
      const a = new Uint8Array([1, 2, 3])
      const b = new Uint8Array([1, 2, 4])
      expect(constantTimeEqual(a, b)).toBe(false)
    })

    it('returns false for different lengths', () => {
      const a = new Uint8Array([1, 2, 3])
      const b = new Uint8Array([1, 2])
      expect(constantTimeEqual(a, b)).toBe(false)
    })
  })
})
