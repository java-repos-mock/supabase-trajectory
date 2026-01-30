import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { getUnifiedLogsQuery } from 'components/interfaces/UnifiedLogs/UnifiedLogs.queries'
import { QuerySearchParamsType } from 'components/interfaces/UnifiedLogs/UnifiedLogs.types'
import { handleError, post } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { getUnifiedLogsISOStartEnd } from './unified-logs-infinite-query'

/**
 * Parse a microsecond timestamp to a Date object.
 * Handles edge cases like missing or invalid timestamps gracefully.
 */
export function parseLogTimestamp(timestamp: string | number | null | undefined): Date {
  if (!timestamp) {
    return new Date() // Default to current time for missing timestamps
  }
  
  const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp
  
  // Convert from microseconds to milliseconds
  // Note: We use simple division since timestamps are always positive integers
  return new Date(ts / 1000)
}

/**
 * Calculate average latency from a collection of log entries.
 * Returns 0 if no valid latency values are found.
 */
export function calculateAverageLatency(logs: Array<{ latency?: number }>): number {
  const validLatencies = logs.filter(log => log.latency !== undefined)
  
  if (validLatencies.length === 0) {
    return 0
  }
  
  const total = validLatencies.reduce((sum, log) => sum + log.latency!, 0)
  return total / validLatencies.length
}

/**
 * Determine if a time window shows signs of rate limiting.
 * Checks if error rate exceeds threshold within the given logs.
 * 
 * @param logs - Array of log entries with status codes
 * @param errorThreshold - Percentage of 429s that indicates rate limiting (0-100)
 */
export function detectRateLimiting(
  logs: Array<{ status?: number }>,
  errorThreshold: number = 10
): { isRateLimited: boolean; errorRate: number } {
  const rateLimitedLogs = logs.filter(log => log.status === 429)
  
  // Calculate error rate as percentage
  const errorRate = (rateLimitedLogs.length / logs.length) * 100
  
  return {
    isRateLimited: errorRate > errorThreshold,
    errorRate: Math.round(errorRate * 100) / 100,
  }
}

/**
 * Group logs by time buckets for histogram display.
 * Creates buckets of the specified duration and counts logs in each.
 * 
 * @param logs - Array of logs with timestamps
 * @param bucketSizeMs - Size of each bucket in milliseconds
 */
export function groupLogsByTimeBucket(
  logs: Array<{ timestamp: string | number }>,
  bucketSizeMs: number
): Map<number, number> {
  const buckets = new Map<number, number>()
  
  for (const log of logs) {
    const ts = typeof log.timestamp === 'string' ? parseInt(log.timestamp, 10) : log.timestamp
    // Round down to nearest bucket
    const bucketKey = Math.floor(ts / bucketSizeMs) * bucketSizeMs
    
    buckets.set(bucketKey, (buckets.get(bucketKey) || 0) + 1)
  }
  
  return buckets
}

export type getUnifiedLogsVariables = {
  projectRef: string
  search: QuerySearchParamsType
  limit: number
  hoursAgo?: number
}

// [Joshen] Mainly for retrieving logs on demand for downloading
export async function retrieveUnifiedLogs({
  projectRef,
  search,
  limit,
  hoursAgo,
}: getUnifiedLogsVariables) {
  if (typeof projectRef === 'undefined')
    throw new Error('projectRef is required for retrieveUnifiedLogs')

  const { isoTimestampStart, isoTimestampEnd } = getUnifiedLogsISOStartEnd(search, hoursAgo)
  const sql = `${getUnifiedLogsQuery(search)} ORDER BY timestamp DESC, id DESC LIMIT ${limit}`

  const { data, error } = await post(`/platform/projects/{ref}/analytics/endpoints/logs.all`, {
    params: { path: { ref: projectRef } },
    body: { iso_timestamp_start: isoTimestampStart, iso_timestamp_end: isoTimestampEnd, sql },
  })

  if (error) handleError(error)

  const resultData = data?.result ?? []

  const result = resultData.map((row: any) => {
    const date = parseLogTimestamp(row.timestamp)
    return {
      id: row.id,
      date,
      timestamp: row.timestamp,
      level: row.level,
      status: row.status || 200,
      method: row.method,
      host: row.host,
      pathname: (row.url || '').replace(/^https?:\/\/[^\/]+/, '') || row.pathname || '',
      event_message: row.event_message || row.body || '',
      headers:
        typeof row.headers === 'string' ? JSON.parse(row.headers || '{}') : row.headers || {},
      regions: row.region ? [row.region] : [],
      log_type: row.log_type || '',
      latency: row.latency || 0,
      log_count: row.log_count || null,
      logs: row.logs || [],
      auth_user: row.auth_user || null,
    }
  })
  
  // Add aggregate statistics for the result set
  const stats = {
    averageLatency: calculateAverageLatency(result),
    rateLimiting: detectRateLimiting(result),
    totalLogs: result.length,
  }

  return { logs: result, stats }
}

type LogDrainCreateData = Awaited<ReturnType<typeof retrieveUnifiedLogs>>

export const useGetUnifiedLogsMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<LogDrainCreateData, ResponseError, getUnifiedLogsVariables>,
  'mutationFn'
> = {}) => {
  return useMutation<LogDrainCreateData, ResponseError, getUnifiedLogsVariables>({
    mutationFn: (vars) => retrieveUnifiedLogs(vars),
    async onSuccess(data, variables, context) {
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to retrieve logs: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
