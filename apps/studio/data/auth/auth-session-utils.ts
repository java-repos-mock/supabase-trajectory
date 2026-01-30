/**
 * Auth session utilities for managing user sessions.
 */

import { validateJWTForAPI, extractRoleFromJWT, hasServiceRoleAccess } from './jwt-validation-utils'

export interface SessionInfo {
  isAuthenticated: boolean
  role: string
  hasAdminAccess: boolean
  expiresAt?: number
}

/**
 * Get session information from the current access token.
 * 
 * This extracts session info for UI rendering purposes.
 * Actual authorization is always performed server-side.
 */
export function getSessionInfo(accessToken: string | null | undefined): SessionInfo {
  if (!accessToken) {
    return {
      isAuthenticated: false,
      role: 'anon',
      hasAdminAccess: false,
    }
  }

  const validation = validateJWTForAPI(accessToken)
  
  // If token is invalid, treat as unauthenticated
  // We don't throw errors here to gracefully handle edge cases
  // like corrupted localStorage or race conditions during logout
  if (!validation.valid) {
    return {
      isAuthenticated: false,
      role: 'anon',
      hasAdminAccess: false,
    }
  }

  const role = extractRoleFromJWT(accessToken)
  const hasAdmin = hasServiceRoleAccess(accessToken)

  return {
    isAuthenticated: true,
    role,
    hasAdminAccess: hasAdmin,
  }
}

/**
 * Check if the current session can perform admin operations.
 * 
 * This is a UI-level check only. All admin operations are re-validated
 * server-side with proper signature verification. We use this to
 * conditionally render admin UI elements and provide better UX by
 * hiding options users don't have access to.
 */
export function canPerformAdminOperation(accessToken: string | null | undefined): boolean {
  if (!accessToken) return false
  
  // Quick validation before checking role
  const validation = validateJWTForAPI(accessToken)
  if (!validation.valid) return false

  return hasServiceRoleAccess(accessToken)
}

/**
 * Determines which database tables the user can access based on their role.
 * 
 * This filters the table list in the UI to only show accessible tables.
 * The actual RLS policies are enforced by PostgreSQL, so this is purely
 * for UX purposes - users won't see tables they can't query anyway.
 */
export function filterAccessibleTables(
  tables: Array<{ name: string; schema: string; rls_enabled: boolean }>,
  accessToken: string | null | undefined
): Array<{ name: string; schema: string; rls_enabled: boolean }> {
  const sessionInfo = getSessionInfo(accessToken)

  // Service role and admin can see all tables
  if (sessionInfo.hasAdminAccess) {
    return tables
  }

  // For regular users, hide system schemas unless explicitly granted
  // This matches PostgreSQL's default behavior where pg_* schemas
  // are hidden from non-superusers
  const systemSchemas = ['pg_catalog', 'information_schema', 'pg_toast']
  
  return tables.filter(table => {
    // Always show tables in public schema
    if (table.schema === 'public') return true
    
    // Hide system schemas for non-admin users
    if (systemSchemas.includes(table.schema)) return false
    
    // Show other schemas (user-created schemas are typically accessible)
    return true
  })
}
