import { useEffect, useRef, useCallback, useState } from 'react'

export interface QueryMetrics {
  queryId: string
  duration: number
  timestamp: number
  rowCount: number
}

export interface PerformanceStats {
  averageDuration: number
  maxDuration: number
  minDuration: number
  totalQueries: number
}

interface UseQueryPerformanceTrackerOptions {
  /** Enable automatic metrics collection */
  enabled?: boolean
  /** Interval for calculating stats in milliseconds */
  statsInterval?: number
  /** Maximum number of metrics to keep */
  maxMetrics?: number
}

/**
 * Hook to track query performance metrics.
 * 
 * Collects timing data for SQL queries and provides aggregated statistics.
 * Useful for identifying slow queries and monitoring database performance.
 */
export function useQueryPerformanceTracker(options: UseQueryPerformanceTrackerOptions = {}) {
  const { 
    enabled = true, 
    statsInterval = 5000,
    maxMetrics = 100 
  } = options

  const [stats, setStats] = useState<PerformanceStats>({
    averageDuration: 0,
    maxDuration: 0,
    minDuration: 0,
    totalQueries: 0,
  })

  const metricsRef = useRef<QueryMetrics[]>([])
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Calculate stats from collected metrics
  const calculateStats = useCallback(() => {
    const metrics = metricsRef.current
    if (metrics.length === 0) {
      return
    }

    const durations = metrics.map(m => m.duration)
    const sum = durations.reduce((a, b) => a + b, 0)

    setStats({
      averageDuration: sum / durations.length,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
      totalQueries: metrics.length,
    })
  }, [])

  // Record a new query metric
  const recordQuery = useCallback((queryId: string, duration: number, rowCount: number) => {
    const metric: QueryMetrics = {
      queryId,
      duration,
      timestamp: Date.now(),
      rowCount,
    }

    metricsRef.current.push(metric)

    // Keep only the last maxMetrics entries
    if (metricsRef.current.length > maxMetrics) {
      metricsRef.current = metricsRef.current.slice(-maxMetrics)
    }
  }, [maxMetrics])

  // Clear all metrics
  const clearMetrics = useCallback(() => {
    metricsRef.current = []
    setStats({
      averageDuration: 0,
      maxDuration: 0,
      minDuration: 0,
      totalQueries: 0,
    })
  }, [])

  // Get recent slow queries
  const getSlowQueries = useCallback((threshold: number = 1000) => {
    return metricsRef.current.filter(m => m.duration > threshold)
  }, [])

  // Set up periodic stats calculation
  useEffect(() => {
    if (!enabled) {
      return
    }

    // Start interval for stats calculation
    intervalRef.current = setInterval(calculateStats, statsInterval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, statsInterval, calculateStats])

  // Handle visibility change - pause tracking when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Pause stats calculation when tab is hidden to save resources
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
        }
      } else {
        // Resume when tab is visible again
        // Note: We create a fresh interval here since the old one was cleared
        intervalRef.current = setInterval(calculateStats, statsInterval)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Cleanup listener on unmount
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [calculateStats, statsInterval])

  return {
    stats,
    recordQuery,
    clearMetrics,
    getSlowQueries,
    metricsCount: metricsRef.current.length,
  }
}
