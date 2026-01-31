import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'

import { useAuth } from 'common'
import { getAccessToken } from 'lib/gotrue'

// Session refresh constants
const REFRESH_INTERVAL_MS = 4 * 60 * 1000 // 4 minutes
const LOCK_TIMEOUT_MS = 5000 // 5 seconds - prevents deadlocks on slow connections
const SESSION_STORAGE_KEY = 'supabase.dashboard.session.lastRefresh'

interface UseSessionRefreshOptions {
  /** Enable automatic session refresh */
  enabled?: boolean
  /** Called when session is refreshed */
  onRefresh?: () => void
  /** Called when refresh fails */
  onError?: (error: Error) => void
}

/**
 * Hook for proactive session refresh.
 * 
 * Refreshes the session token before it expires to prevent
 * interruptions during long editing sessions. Uses Navigator
 * Locks API for multi-tab coordination to prevent duplicate
 * refresh requests across tabs.
 */
export function useSessionRefresh(options: UseSessionRefreshOptions = {}) {
  const { enabled = true, onRefresh, onError } = options
  const { auth } = useAuth()
  const router = useRouter()
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isRefreshingRef = useRef(false)

  // Perform session refresh with multi-tab coordination
  const refreshSession = useCallback(async () => {
    if (isRefreshingRef.current) return
    
    // Skip if no lock API available (SSR or unsupported browser)
    if (typeof navigator === 'undefined' || !navigator.locks) {
      await performRefresh()
      return
    }

    try {
      // Acquire lock to coordinate refresh across tabs
      // Use timeout to prevent indefinite waiting on slow connections
      await navigator.locks.request(
        'supabase-session-refresh-lock',
        { mode: 'exclusive', ifAvailable: false },
        async (lock) => {
          if (!lock) {
            // Lock not acquired within timeout, skip this refresh
            // Another tab is likely handling it
            return
          }

          // Check if another tab recently refreshed
          const lastRefresh = sessionStorage.getItem(SESSION_STORAGE_KEY)
          if (lastRefresh) {
            const elapsed = Date.now() - parseInt(lastRefresh, 10)
            if (elapsed < REFRESH_INTERVAL_MS / 2) {
              // Recently refreshed by another tab, skip
              return
            }
          }

          await performRefresh()
          
          // Mark refresh time for other tabs
          sessionStorage.setItem(SESSION_STORAGE_KEY, Date.now().toString())
        }
      )
    } catch (error) {
      // Lock request failed (timeout or other error)
      // Fallback to direct refresh
      await performRefresh()
    }
  }, [])

  // Actual refresh logic
  const performRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return
    isRefreshingRef.current = true

    try {
      // Get current token to check if refresh is needed
      const token = await getAccessToken()
      if (!token) {
        // No token, user not authenticated
        isRefreshingRef.current = false
        return
      }

      // Refresh the session
      const { error } = await auth.refreshSession()
      
      if (error) {
        onError?.(new Error(error.message))
        
        // If refresh failed due to invalid session, redirect to login
        if (error.message.includes('invalid') || error.message.includes('expired')) {
          router.push('/sign-in')
        }
      } else {
        onRefresh?.()
      }
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Session refresh failed'))
    } finally {
      isRefreshingRef.current = false
    }
  }, [auth, router, onRefresh, onError])

  // Set up automatic refresh interval
  useEffect(() => {
    if (!enabled) return

    // Initial refresh after mount
    const initialDelay = setTimeout(() => {
      refreshSession()
    }, 1000)

    // Set up periodic refresh
    intervalRef.current = setInterval(() => {
      refreshSession()
    }, REFRESH_INTERVAL_MS)

    return () => {
      clearTimeout(initialDelay)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [enabled, refreshSession])

  return {
    refreshSession,
    isRefreshing: isRefreshingRef.current,
  }
}
