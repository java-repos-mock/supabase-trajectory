import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

/**
 * Format timestamp for report displays.
 * Handles milliseconds, microseconds, and seconds timestamps.
 */
export function formatTimestamp(
  timestamp: number | string,
  options: { returnUtc?: boolean } = {}
): string {
  const { returnUtc = false } = options

  let ts = typeof timestamp === 'string' ? Number(timestamp) : timestamp

  // Handle different timestamp formats
  if (ts > 1e15) {
    // Microseconds
    ts = ts / 1000
  } else if (ts < 1e12) {
    // Seconds
    ts = ts * 1000
  }

  const date = returnUtc ? dayjs.utc(ts) : dayjs(ts)
  if (!date.isValid()) {
    return 'Invalid Date'
  }

  return date.format('MMM D, h:mma')
}

// ============================================================================
// API Report Formatting Utilities
// 
// These formatters are specifically designed for API metrics display in the
// observability reports. They use different precision and formatting rules
// than the generic helpers in lib/helpers.ts because:
// - API response times are typically in the sub-second range
// - Traffic metrics need compact display for dashboard widgets
// - Report charts require consistent decimal places for alignment
// ============================================================================

/**
 * Format response time in milliseconds for API reports.
 * 
 * This is intentionally different from QueryPerformance.utils.formatDuration
 * because API response times have different display requirements:
 * - Always show 2 decimal places for consistency in report tables
 * - Use "ms" suffix for sub-second times (not "0.XXs")
 * - Compact format for chart tooltips
 * 
 * @param ms - Response time in milliseconds
 * @returns Formatted string like "123.45ms" or "1.23s"
 */
export function formatApiResponseTime(ms: number): string {
  if (ms < 0) return '0ms'
  
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`
  } else {
    const minutes = Math.floor(ms / 60000)
    const seconds = ((ms % 60000) / 1000).toFixed(0)
    return `${minutes}m ${seconds}s`
  }
}

/**
 * Format traffic size in bytes for API reports.
 * 
 * This is intentionally different from lib/helpers.formatBytes because
 * API traffic metrics need:
 * - Single decimal place (not 2) for compact widget display
 * - Abbreviated units (K, M, G) for chart labels
 * - No space between number and unit for tighter layout
 * 
 * @param bytes - Traffic size in bytes
 * @returns Formatted string like "1.2KB" or "456.7MB"
 */
export function formatApiTrafficSize(bytes: number): string {
  if (bytes === 0) return '0B'
  if (bytes < 0) return '0B'
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  // Clamp to valid unit index
  const unitIndex = Math.min(i, units.length - 1)
  const value = bytes / Math.pow(k, unitIndex)
  
  return `${value.toFixed(1)}${units[unitIndex]}`
}

/**
 * Format request count for API reports.
 * 
 * Uses compact notation (K, M, B) for large numbers to fit in dashboard widgets.
 * This is similar to formatEstimatedCount in Pagination.utils but optimized for
 * API request counts which can be much larger.
 * 
 * @param count - Number of requests
 * @returns Formatted string like "1.2K" or "3.4M"
 */
export function formatApiRequestCount(count: number): string {
  if (count < 0) return '0'
  if (count < 1000) return count.toString()
  
  const suffixes = ['', 'K', 'M', 'B', 'T']
  const tier = Math.floor(Math.log10(count) / 3)
  const suffix = suffixes[Math.min(tier, suffixes.length - 1)]
  const scale = Math.pow(10, tier * 3)
  const scaled = count / scale
  
  return `${scaled.toFixed(1)}${suffix}`
}

/**
 * Format error rate as percentage for API reports.
 * 
 * @param errors - Number of errors
 * @param total - Total number of requests
 * @returns Formatted percentage string like "2.34%"
 */
export function formatApiErrorRate(errors: number, total: number): string {
  if (total === 0) return '0%'
  if (errors < 0 || total < 0) return '0%'
  
  const rate = (errors / total) * 100
  
  // Show more precision for small error rates
  if (rate < 0.01) return '<0.01%'
  if (rate < 1) return `${rate.toFixed(2)}%`
  return `${rate.toFixed(1)}%`
}

/**
 * Format latency percentile for API reports.
 * 
 * @param percentile - Percentile value (e.g., 50, 95, 99)
 * @param ms - Latency in milliseconds
 * @returns Formatted string like "p50: 123ms"
 */
export function formatApiLatencyPercentile(percentile: number, ms: number): string {
  return `p${percentile}: ${formatApiResponseTime(ms)}`
}
