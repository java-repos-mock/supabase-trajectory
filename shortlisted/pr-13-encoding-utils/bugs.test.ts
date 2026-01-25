/**
 * Tests proving bugs in PR #13 that Greptile MISSED
 */

describe('PR #13: Bugs Greptile Missed', () => {

  /**
   * BUG 1: numbersEqual uses === for floating point comparison
   * 
   * Floating point arithmetic is imprecise: 0.1 + 0.2 !== 0.3
   * 
   * Category: BAD PRACTICE - Wrong approach for float comparison
   */
  describe('numbersEqual - float comparison with ===', () => {
    function numbersEqual(a: number, b: number): boolean {
      return a === b  // BAD PRACTICE for floats!
    }

    it('fails for floating point arithmetic', () => {
      const result = numbersEqual(0.1 + 0.2, 0.3)
      
      expect(result).toBe(false)  // BUG!
      // 0.1 + 0.2 = 0.30000000000000004 in JavaScript
      
      console.log('0.1 + 0.2 =', 0.1 + 0.2)
      console.log('Expected: 0.3')
    })

    it('FIX: should use epsilon comparison', () => {
      function numbersEqualFixed(a: number, b: number, epsilon = 1e-10): boolean {
        return Math.abs(a - b) < epsilon
      }

      expect(numbersEqualFixed(0.1 + 0.2, 0.3)).toBe(true)
    })
  })

  /**
   * BUG 2: normalizeString doesn't do Unicode normalization
   * 
   * Same visual characters can have different byte representations
   * 'café' (precomposed) !== 'café' (combining accent)
   * 
   * Category: BAD PRACTICE - Missing Unicode normalization
   */
  describe('normalizeString - missing Unicode normalization', () => {
    function normalizeString(str: string): string {
      return str.toLowerCase().trim()  // Missing .normalize()!
    }

    it('fails for combining characters', () => {
      const precomposed = 'café'      // é as single character (U+00E9)
      const combining = 'cafe\u0301'  // e + combining acute (U+0301)
      
      // They LOOK the same but have different bytes
      expect(precomposed.length).toBe(4)
      expect(combining.length).toBe(5)
      
      // normalizeString doesn't make them equal
      const result = normalizeString(precomposed) === normalizeString(combining)
      expect(result).toBe(false)  // BUG!
    })

    it('FIX: should use .normalize()', () => {
      function normalizeStringFixed(str: string): string {
        return str.toLowerCase().trim().normalize('NFC')
      }

      const precomposed = 'café'
      const combining = 'cafe\u0301'
      
      expect(normalizeStringFixed(precomposed)).toBe(normalizeStringFixed(combining))
    })
  })

  /**
   * BUG 3: toMilliseconds heuristic fails at boundary
   * 
   * Uses 10000000000 as threshold to detect seconds vs milliseconds
   * But this fails for timestamps between 1970-04-26 and year 2286
   * 
   * Category: EDGE CASE - Heuristic has boundary issues
   */
  describe('toMilliseconds - boundary heuristic', () => {
    function toMilliseconds(timestamp: number): number {
      if (timestamp < 10000000000) {
        return timestamp * 1000  // Treat as seconds
      }
      return timestamp  // Treat as milliseconds
    }

    it('incorrectly handles timestamps at boundary', () => {
      // 10000000000 ms = April 26, 1970
      // 10000000000 s  = November 20, 2286
      
      const msTimestamp = 9999999999  // This is actually ms from 1970
      const result = toMilliseconds(msTimestamp)
      
      // BUG: Treats it as seconds, multiplies by 1000
      expect(result).toBe(9999999999000)  // Wrong!
      // Should be 9999999999 (it was already ms)
    })

    it('documents the heuristic limitation', () => {
      // The heuristic assumes:
      // - Timestamps < 10^10 are in seconds
      // - Timestamps >= 10^10 are in milliseconds
      //
      // This fails for:
      // - Millisecond timestamps from 1970-01-01 to 1970-04-26
      // - Second timestamps from 2001-09-09 onwards
      //
      // FIX: Require explicit unit or use a more robust detection
    })
  })

  /**
   * BUG 4: encodeForUrl uses Base64 not Base64URL
   * 
   * Base64 produces +, /, = characters that break URLs
   * Base64URL uses -, _, and omits padding
   * 
   * Category: BAD PRACTICE - Wrong encoding for URL context
   */
  describe('encodeForUrl - Base64 not Base64URL', () => {
    function encodeBase64(input: string): string {
      return Buffer.from(input, 'utf-8').toString('base64')
    }

    function encodeForUrl(data: unknown): string {
      const json = JSON.stringify(data)
      return encodeBase64(json)  // BAD: Uses regular Base64!
    }

    it('produces URL-unsafe characters', () => {
      const data = { redirect: 'https://example.com?foo=bar&baz=qux' }
      const encoded = encodeForUrl(data)
      
      // Base64 can contain +, /, =
      const hasSlash = encoded.includes('/')
      const hasPlus = encoded.includes('+')
      const hasEquals = encoded.includes('=')
      
      console.log('Encoded:', encoded)
      console.log('Has /:', hasSlash, 'Has +:', hasPlus, 'Has =:', hasEquals)
      
      // These characters have special meaning in URLs:
      // / = path separator
      // + = space in query string
      // = = key-value separator
      
      // In a URL like: /page?data={encoded}
      // These characters will break parsing
    })

    it('FIX: should use Base64URL', () => {
      function encodeBase64URL(input: string): string {
        return Buffer.from(input, 'utf-8')
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '')
      }

      function encodeForUrlFixed(data: unknown): string {
        return encodeBase64URL(JSON.stringify(data))
      }

      const encoded = encodeForUrlFixed({ redirect: 'https://example.com?foo=bar' })
      expect(encoded.includes('/')).toBe(false)
      expect(encoded.includes('+')).toBe(false)
    })
  })
})

/**
 * VERDICT for PR #13:
 * 
 * Greptile CAUGHT (11 comments!):
 * - deprecated escape/unescape
 * - hasHeader case-insensitivity
 * - useCallback unnecessary
 * - useMemo unused
 * - useStaticEffectEvent pattern
 * - String concatenation inefficient
 * - parseHeaders does nothing
 * - Test coverage gap
 * - Query param undefined
 * 
 * Greptile MISSED:
 * - numbersEqual float === (bad practice)
 * - normalizeString Unicode (bad practice)
 * - toMilliseconds boundary (edge case)
 * - encodeForUrl Base64 (bad practice)
 * 
 * Categories: domain-knowledge, bad-practice, edge-case
 */
