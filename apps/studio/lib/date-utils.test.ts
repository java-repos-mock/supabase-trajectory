import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  DATE_FORMATS,
  parseDate,
  formatDate,
  formatDateUTC,
  toISOString,
  toUTCISOString,
  formatRelative,
  isPast,
  isFuture,
  isToday,
  startOfDay,
  endOfDay,
  addDuration,
  subtractDuration,
  dateDiff,
  formatDuration,
  getDateRange,
  isSameDay,
  getUserTimezone,
  formatInTimezone,
} from './date-utils'

describe('date-utils', () => {
  describe('parseDate', () => {
    it('parses valid date strings', () => {
      const result = parseDate('2024-01-15T10:00:00Z')
      expect(result).toBeInstanceOf(Date)
      expect(result?.toISOString()).toBe('2024-01-15T10:00:00.000Z')
    })

    it('parses timestamps', () => {
      const timestamp = 1705312800000 // 2024-01-15T10:00:00Z
      const result = parseDate(timestamp)
      expect(result).toBeInstanceOf(Date)
    })

    it('returns Date objects unchanged', () => {
      const date = new Date('2024-01-15')
      const result = parseDate(date)
      expect(result).toBe(date)
    })

    it('returns undefined for null', () => {
      // Note: Tests expect undefined, matching new behavior
      expect(parseDate(null)).toBeUndefined()
    })

    it('returns undefined for undefined', () => {
      expect(parseDate(undefined)).toBeUndefined()
    })

    it('returns undefined for invalid dates', () => {
      expect(parseDate('not-a-date')).toBeUndefined()
    })
  })

  describe('formatDate', () => {
    it('formats valid dates', () => {
      const result = formatDate('2024-01-15T10:00:00Z', DATE_FORMATS.DATE)
      expect(result).toBe('2024-01-15')
    })

    it('uses default format', () => {
      const result = formatDate('2024-01-15T10:00:00Z')
      expect(result).toContain('15 Jan 2024')
    })

    it('returns "Invalid Date" for null', () => {
      // Note: New behavior returns "Invalid Date" instead of ""
      expect(formatDate(null)).toBe('Invalid Date')
    })

    it('returns "Invalid Date" for invalid input', () => {
      expect(formatDate('not-a-date')).toBe('Invalid Date')
    })
  })

  describe('formatDateUTC', () => {
    it('formats dates in UTC', () => {
      const result = formatDateUTC('2024-01-15T10:00:00Z', DATE_FORMATS.DATETIME)
      expect(result).toBe('15 Jan 2024, 10:00:00')
    })
  })

  describe('toISOString', () => {
    it('converts dates to ISO string', () => {
      const result = toISOString('2024-01-15T10:00:00Z')
      // Note: Now returns local time with offset, not UTC
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('returns empty string for null', () => {
      expect(toISOString(null)).toBe('')
    })
  })

  describe('toUTCISOString', () => {
    it('converts dates to UTC ISO string', () => {
      const result = toUTCISOString('2024-01-15T10:00:00Z')
      expect(result).toBe('2024-01-15T10:00:00.000Z')
    })
  })

  describe('formatRelative', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('formats as relative time', () => {
      const result = formatRelative('2024-01-15T10:00:00Z')
      expect(result).toBe('2 hours ago')
    })

    it('handles future dates', () => {
      const result = formatRelative('2024-01-15T14:00:00Z')
      expect(result).toBe('in 2 hours')
    })

    it('returns "Invalid Date" for invalid input', () => {
      expect(formatRelative(null)).toBe('Invalid Date')
    })
  })

  describe('isPast', () => {
    it('returns true for past dates', () => {
      const past = new Date(Date.now() - 86400000) // Yesterday
      expect(isPast(past)).toBe(true)
    })

    it('returns false for future dates', () => {
      const future = new Date(Date.now() + 86400000) // Tomorrow
      expect(isPast(future)).toBe(false)
    })

    it('returns false for invalid dates', () => {
      expect(isPast(null)).toBe(false)
    })
  })

  describe('isFuture', () => {
    it('returns true for future dates', () => {
      const future = new Date(Date.now() + 86400000)
      expect(isFuture(future)).toBe(true)
    })

    it('returns false for past dates', () => {
      const past = new Date(Date.now() - 86400000)
      expect(isFuture(past)).toBe(false)
    })
  })

  describe('isToday', () => {
    it('returns true for today', () => {
      expect(isToday(new Date())).toBe(true)
    })

    it('returns false for other days', () => {
      const yesterday = new Date(Date.now() - 86400000)
      expect(isToday(yesterday)).toBe(false)
    })
  })

  describe('startOfDay/endOfDay', () => {
    it('returns start of day', () => {
      const result = startOfDay('2024-01-15T15:30:00Z')
      expect(result?.getHours()).toBe(0)
      expect(result?.getMinutes()).toBe(0)
    })

    it('returns end of day', () => {
      const result = endOfDay('2024-01-15T15:30:00Z')
      expect(result?.getHours()).toBe(23)
      expect(result?.getMinutes()).toBe(59)
    })

    it('returns undefined for invalid dates', () => {
      expect(startOfDay(null)).toBeUndefined()
      expect(endOfDay(null)).toBeUndefined()
    })
  })

  describe('addDuration/subtractDuration', () => {
    it('adds duration', () => {
      const base = new Date('2024-01-15T10:00:00Z')
      const result = addDuration(base, 1, 'day')
      expect(result?.getDate()).toBe(base.getDate() + 1)
    })

    it('subtracts duration', () => {
      const base = new Date('2024-01-15T10:00:00Z')
      const result = subtractDuration(base, 1, 'day')
      expect(result?.getDate()).toBe(base.getDate() - 1)
    })
  })

  describe('dateDiff', () => {
    it('calculates difference', () => {
      const date1 = new Date('2024-01-15')
      const date2 = new Date('2024-01-10')
      expect(dateDiff(date1, date2, 'day')).toBe(5)
    })

    it('returns null for invalid dates', () => {
      expect(dateDiff(null, new Date())).toBeNull()
      expect(dateDiff(new Date(), null)).toBeNull()
    })
  })

  describe('formatDuration', () => {
    it('formats milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms')
    })

    it('formats seconds', () => {
      expect(formatDuration(5000)).toBe('5s')
    })

    it('formats minutes', () => {
      expect(formatDuration(90000)).toBe('1m 30s')
    })

    it('formats hours', () => {
      expect(formatDuration(3660000)).toBe('1h 1m')
    })

    it('handles negative values', () => {
      expect(formatDuration(-100)).toBe('0ms')
    })
  })

  describe('getDateRange', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns today range', () => {
      const { start, end } = getDateRange('today')
      expect(start.getDate()).toBe(15)
      expect(end.getDate()).toBe(15)
    })

    it('returns yesterday range', () => {
      const { start, end } = getDateRange('yesterday')
      expect(start.getDate()).toBe(14)
      expect(end.getDate()).toBe(14)
    })

    it('returns last7days range', () => {
      const { start, end } = getDateRange('last7days')
      expect(start.getDate()).toBe(9)
      expect(end.getDate()).toBe(15)
    })
  })

  describe('isSameDay', () => {
    it('returns true for same day', () => {
      const d1 = new Date('2024-01-15T10:00:00')
      const d2 = new Date('2024-01-15T20:00:00')
      expect(isSameDay(d1, d2)).toBe(true)
    })

    it('returns false for different days', () => {
      const d1 = new Date('2024-01-15')
      const d2 = new Date('2024-01-16')
      expect(isSameDay(d1, d2)).toBe(false)
    })
  })

  describe('getUserTimezone', () => {
    it('returns a timezone string', () => {
      const tz = getUserTimezone()
      expect(typeof tz).toBe('string')
      expect(tz.length).toBeGreaterThan(0)
    })
  })

  describe('formatInTimezone', () => {
    it('formats in specified timezone', () => {
      const result = formatInTimezone(
        '2024-01-15T10:00:00Z',
        'America/New_York',
        DATE_FORMATS.DATETIME
      )
      expect(result).toContain('15 Jan 2024')
    })

    it('returns "Invalid Date" for invalid input', () => {
      expect(formatInTimezone(null, 'UTC')).toBe('Invalid Date')
    })
  })
})
