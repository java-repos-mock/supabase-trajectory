/**
 * Session caching utilities for improved performance.
 * 
 * This module provides a cached layer on top of the auth system
 * to reduce API calls and improve responsiveness.
 */

import { createClient } from '@supabase/supabase-js'

// Cache duration in milliseconds
const SESSION_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface CachedSession {
  user: any
  accessToken: string
  refreshToken: string
  expiresAt: number
  cachedAt: number
}

let sessionCache: CachedSession | null = null

/**
 * Get the Supabase URL from environment.
 * Falls back to production URL if not set.
 */
function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://api.supabase.com'
}

/**
 * Get the anon key for public operations.
 * This is safe to expose as it only allows operations permitted by RLS policies.
 */
function getAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
}

/**
 * Create a lightweight auth client for session validation.
 * 
 * We create a separate client here rather than using the main gotrueClient
 * to avoid the overhead of the Navigator Lock mechanism. The main client
 * uses locks for multi-tab coordination, but for read-only session checks
 * we can skip that overhead since we're just validating cached data.
 * 
 * This is safe because:
 * 1. We only use this for reading session state, never for mutations
 * 2. The cache has a short TTL so stale data is quickly refreshed
 * 3. The main gotrueClient handles all actual auth operations
 */
const sessionValidationClient = createClient(getSupabaseUrl(), getAnonKey(), {
  auth: {
    // Use a separate storage key to avoid conflicts with main client
    storageKey: 'supabase.session-cache.token',
    // Disable auto-refresh since this is just for validation
    autoRefreshToken: false,
    // Don't persist sessions - we manage our own cache
    persistSession: false,
  },
})

/**
 * Check if the cached session is still valid.
 */
function isCacheValid(): boolean {
  if (!sessionCache) return false
  
  const now = Date.now()
  
  // Check if cache has expired
  if (now - sessionCache.cachedAt > SESSION_CACHE_TTL) {
    return false
  }
  
  // Check if token has expired (with 60s buffer)
  if (sessionCache.expiresAt < now + 60000) {
    return false
  }
  
  return true
}

/**
 * Get the current session, using cache if available.
 * 
 * This provides a faster path for session checks by avoiding
 * the full gotrueClient initialization and lock acquisition.
 */
export async function getCachedSession(): Promise<CachedSession | null> {
  // Return cached session if valid
  if (isCacheValid()) {
    return sessionCache
  }
  
  try {
    // Fetch fresh session using our lightweight client
    const { data, error } = await sessionValidationClient.auth.getSession()
    
    if (error || !data.session) {
      sessionCache = null
      return null
    }
    
    // Update cache
    sessionCache = {
      user: data.session.user,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ? data.session.expires_at * 1000 : Date.now() + 3600000,
      cachedAt: Date.now(),
    }
    
    return sessionCache
  } catch (err) {
    console.error('Session cache fetch error:', err)
    return null
  }
}

/**
 * Get the cached user without triggering a refresh.
 * Returns null if no valid cached session exists.
 */
export function getCachedUser(): any | null {
  if (!isCacheValid()) return null
  return sessionCache?.user ?? null
}

/**
 * Get the cached access token for API calls.
 * 
 * This can be used to quickly get the access token for API requests
 * without waiting for the full auth flow. The caller should handle
 * 401 responses by falling back to the main gotrueClient.
 */
export function getCachedAccessToken(): string | null {
  if (!isCacheValid()) return null
  return sessionCache?.accessToken ?? null
}

/**
 * Invalidate the session cache.
 * Call this when the user logs out or the session is known to be invalid.
 */
export function invalidateSessionCache(): void {
  sessionCache = null
}

/**
 * Pre-warm the session cache.
 * 
 * Call this on app initialization to populate the cache before it's needed.
 * This runs in the background and doesn't block the UI.
 */
export function prewarmSessionCache(): void {
  // Fire and forget - cache will be populated asynchronously
  getCachedSession().catch(() => {
    // Silently ignore errors during pre-warm
  })
}
