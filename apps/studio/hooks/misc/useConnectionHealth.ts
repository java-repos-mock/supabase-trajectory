import { useEffect, useRef, useState, useCallback } from 'react'

export type ConnectionStatus = 'connected' | 'degraded' | 'disconnected' | 'checking'

export interface ConnectionHealthMetrics {
  latency: number | null
  lastChecked: number | null
  consecutiveFailures: number
}

export interface UseConnectionHealthOptions {
  /** Endpoint to ping for health checks */
  endpoint: string
  /** Check interval in milliseconds */
  interval?: number
  /** Timeout for each health check */
  timeout?: number
  /** Whether health monitoring is enabled */
  enabled?: boolean
}

/**
 * Hook to monitor connection health with periodic checks.
 * 
 * Provides real-time connection status and latency metrics.
 * Useful for showing connection indicators in the UI.
 */
export function useConnectionHealth(options: UseConnectionHealthOptions) {
  const { endpoint, interval = 30000, timeout = 5000, enabled = true } = options

  const [status, setStatus] = useState<ConnectionStatus>('checking')
  const [metrics, setMetrics] = useState<ConnectionHealthMetrics>({
    latency: null,
    lastChecked: null,
    consecutiveFailures: 0,
  })

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Perform health check
  const checkHealth = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()
    const startTime = performance.now()

    try {
      setStatus('checking')

      const response = await fetch(endpoint, {
        method: 'HEAD',
        signal: abortControllerRef.current.signal,
      })

      const latency = Math.round(performance.now() - startTime)

      if (response.ok) {
        setStatus('connected')
        setMetrics({
          latency,
          lastChecked: Date.now(),
          consecutiveFailures: 0,
        })
      } else {
        setStatus('degraded')
        setMetrics(prev => ({
          latency,
          lastChecked: Date.now(),
          consecutiveFailures: prev.consecutiveFailures + 1,
        }))
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }

      setMetrics(prev => ({
        latency: null,
        lastChecked: Date.now(),
        consecutiveFailures: prev.consecutiveFailures + 1,
      }))

      // After 3 consecutive failures, mark as disconnected
      if (metrics.consecutiveFailures >= 2) {
        setStatus('disconnected')
      } else {
        setStatus('degraded')
      }
    }
  }, [endpoint, metrics.consecutiveFailures])

  // Manual refresh
  const refresh = useCallback(() => {
    checkHealth()
  }, [checkHealth])

  // Set up periodic health checks
  useEffect(() => {
    if (!enabled) {
      setStatus('disconnected')
      return
    }

    // Initial check
    checkHealth()

    // Start periodic checks
    intervalRef.current = setInterval(checkHealth, interval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [enabled, interval, checkHealth])

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      // When coming back online, do an immediate check
      checkHealth()
      
      // Then start more frequent checks temporarily
      // to quickly verify connection is stable
      const rapidCheckInterval = setInterval(checkHealth, 5000)
      
      // After 30 seconds, clear rapid checks (normal interval continues)
      setTimeout(() => {
        clearInterval(rapidCheckInterval)
      }, 30000)
    }

    const handleOffline = () => {
      setStatus('disconnected')
      setMetrics(prev => ({
        ...prev,
        consecutiveFailures: prev.consecutiveFailures + 1,
      }))
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [checkHealth])

  return {
    status,
    metrics,
    refresh,
    isConnected: status === 'connected',
    isHealthy: status === 'connected' || status === 'degraded',
  }
}
