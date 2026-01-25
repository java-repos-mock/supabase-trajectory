/**
 * Tests proving bugs in PR #17 that Greptile MISSED
 */

import { encodeCursor, decodeCursor } from './pagination-utils'
import { deduplicateEvents, RealtimeEvent } from './realtime-manager'
import { throttle } from './rate-limiter'

describe('PR #17: Bugs Greptile Missed', () => {

  /**
   * BUG 1: btoa/atob don't handle Unicode
   * Cursors with non-ASCII characters will crash
   */
  describe('encodeCursor - Unicode crash', () => {
    it('FAILS: crashes with Japanese characters', () => {
      const cursorData = {
        sort: '2024-01-01',
        id: 'user_日本語',  // Japanese
      }
      
      // BUG: btoa() throws "InvalidCharacterError" for non-ASCII
      expect(() => encodeCursor(cursorData)).not.toThrow()
      // FAILS in browser - btoa cannot encode Unicode
    })

    it('FAILS: crashes with emoji', () => {
      const cursorData = {
        sort: '2024-01-01',
        id: 'comment_🎉',
      }
      
      expect(() => encodeCursor(cursorData)).not.toThrow()
      // FAILS - emoji is outside Latin1 range
    })

    it('FIX: should use encodeURIComponent or TextEncoder', () => {
      // Correct implementation:
      // return btoa(encodeURIComponent(JSON.stringify(data)))
      // Or: return btoa(unescape(encodeURIComponent(JSON.stringify(data))))
    })
  })

  /**
   * BUG 2: deduplicateEvents uses only timestamp as key
   * Different events with same timestamp get incorrectly deduped
   */
  describe('deduplicateEvents - timestamp-only key', () => {
    it('FAILS: loses different events with same timestamp', () => {
      const seen = new Set<string>()
      
      // Two DIFFERENT events at the exact same millisecond
      const events: RealtimeEvent[] = [
        {
          type: 'INSERT',
          table: 'users',
          schema: 'public',
          old: null,
          new: { id: 1, name: 'Alice' },
          timestamp: '2024-01-01T12:00:00.000Z',
        },
        {
          type: 'INSERT',
          table: 'users',
          schema: 'public',
          old: null,
          new: { id: 2, name: 'Bob' },  // DIFFERENT user!
          timestamp: '2024-01-01T12:00:00.000Z',  // Same timestamp
        },
      ]
      
      const result = deduplicateEvents(events, seen)
      
      // BUG: Only returns 1 event, losing Bob!
      expect(result).toHaveLength(2)  // FAILS - returns 1
    })

    it('FIX: should use composite key', () => {
      // Correct implementation:
      // const key = `${event.timestamp}:${event.type}:${event.table}:${JSON.stringify(event.new)}`
      // Or use event ID if available
    })
  })

  /**
   * BUG 3: throttle returns undefined for throttled calls
   * Callers expecting a return value get undefined
   */
  describe('throttle - returns undefined', () => {
    it('FAILS: returns undefined instead of last result', () => {
      const double = (x: number) => x * 2
      const throttled = throttle(double, 1000)
      
      const result1 = throttled(5)   // Returns 10
      const result2 = throttled(10)  // Returns undefined (throttled)
      
      expect(result1).toBe(10)
      expect(result2).toBeDefined()  // FAILS - returns undefined
    })

    it('FIX: should return last result or explicit indicator', () => {
      // Option 1: Return last result
      // let lastResult: ReturnType<T>
      // if (now - lastCall >= limitMs) { lastResult = fn(...args); return lastResult }
      // return lastResult
      
      // Option 2: Return symbol indicating throttled
      // return THROTTLED_SYMBOL
    })
  })
})

/**
 * VERDICT for PR #17:
 * 
 * Greptile CAUGHT (impressive!):
 * - Heartbeat interval unit confusion (30 seconds as 30ms)
 * - Heartbeat timeout calculation  
 * - parseRetryAfter seconds vs ms inconsistency
 * - X-RateLimit-Reset is timestamp not duration
 * - SQL injection in cursor WHERE clause
 * - Off-by-one in hasNextPage
 * - userState object in effect deps
 * - Stale closure with onEvent
 * 
 * Greptile MISSED:
 * - btoa/atob Unicode crash
 * - deduplicateEvents timestamp-only key (data loss)
 * - throttle returns undefined
 * 
 * RECOMMENDATION: SHORTLIST - bugs require domain knowledge
 */
