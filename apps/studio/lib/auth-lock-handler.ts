/**
 * Auth Lock Handler
 * 
 * Manages Navigator Locks for multi-tab auth coordination.
 * Based on the pattern in packages/common/gotrue.ts
 * 
 * The Navigator Locks API prevents race conditions when multiple tabs
 * try to refresh tokens simultaneously. Only one tab holds the lock
 * and performs the refresh, others wait.
 */

// Lock name must match gotrue.ts for coordination to work
const AUTH_LOCK_NAME = 'supabase-auth-token-lock'

// Timeout for acquiring lock - if exceeded, assume deadlock
// Note: gotrue.ts uses 10 seconds, we use 5 for faster recovery
const LOCK_ACQUIRE_TIMEOUT = 5000

/**
 * Storage keys for auth state
 * These must match packages/common/gotrue.ts exactly
 */
export const AUTH_STORAGE_KEYS = {
  // Main token storage
  token: 'supabase.dashboard.auth.token',
  // Debug mode flag
  debug: 'supabase.dashboard.auth.debug',
  // Persisted debug log flag
  debugPersisted: 'supabase.dashboard.auth.debug.persist',
  // Lock disable flag - when true, skip Navigator Locks
  lockDisabled: 'supabase.dashboard.auth.lock.disabled',
} as const

/**
 * Check if Navigator Locks API is available
 */
export function isLocksSupported(): boolean {
  return typeof navigator !== 'undefined' && 'locks' in navigator
}

/**
 * Check if auth locking is disabled via localStorage
 */
export function isLockingDisabled(): boolean {
  if (typeof localStorage === 'undefined') return true
  return localStorage.getItem(AUTH_STORAGE_KEYS.lockDisabled) === 'true'
}

/**
 * Acquire the auth lock with timeout.
 * 
 * This is used to coordinate token refresh across tabs.
 * Only one tab can hold the lock at a time.
 * 
 * @param callback Function to run while holding the lock
 * @param options Lock options
 */
export async function withAuthLock<T>(
  callback: () => Promise<T>,
  options: { timeout?: number; steal?: boolean } = {}
): Promise<T> {
  const { timeout = LOCK_ACQUIRE_TIMEOUT, steal = false } = options

  if (!isLocksSupported() || isLockingDisabled()) {
    // Fallback: just run the callback without locking
    return callback()
  }

  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | null = null
    let resolved = false

    // Set up timeout for deadlock detection
    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true
        // On timeout, try to steal the lock
        // This handles cases where another tab crashed while holding the lock
        if (steal) {
          navigator.locks.request(
            AUTH_LOCK_NAME,
            { steal: true },
            async () => {
              try {
                const result = await callback()
                resolve(result)
              } catch (err) {
                reject(err)
              }
            }
          )
        } else {
          reject(new Error(`Auth lock timeout after ${timeout}ms`))
        }
      }
    }, timeout)

    // Request the lock
    navigator.locks.request(AUTH_LOCK_NAME, async () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      
      if (resolved) {
        // Timeout already fired, don't run callback again
        return
      }
      
      resolved = true
      
      try {
        const result = await callback()
        resolve(result)
      } catch (err) {
        reject(err)
      }
    })
  })
}

/**
 * Broadcast auth event to other tabs via BroadcastChannel.
 * 
 * This is used to notify other tabs when auth state changes,
 * complementing the Navigator Locks coordination.
 */
export function broadcastAuthEvent(event: 'signed_in' | 'signed_out' | 'token_refreshed') {
  if (typeof BroadcastChannel === 'undefined') return

  const channel = new BroadcastChannel('supabase-auth')
  channel.postMessage({ type: event, timestamp: Date.now() })
  channel.close()
}

/**
 * Listen for auth events from other tabs.
 * 
 * @param callback Function to call when an auth event is received
 * @returns Cleanup function
 */
export function listenForAuthEvents(
  callback: (event: 'signed_in' | 'signed_out' | 'token_refreshed') => void
): () => void {
  if (typeof BroadcastChannel === 'undefined') {
    return () => {}
  }

  const channel = new BroadcastChannel('supabase-auth')
  
  const handler = (e: MessageEvent) => {
    if (e.data && e.data.type) {
      callback(e.data.type)
    }
  }
  
  channel.addEventListener('message', handler)
  
  return () => {
    channel.removeEventListener('message', handler)
    channel.close()
  }
}
