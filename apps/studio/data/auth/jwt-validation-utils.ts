/**
 * JWT validation utilities for auth token handling.
 * 
 * Provides client-side validation for JWT tokens before API calls.
 */

export interface JWTPayload {
  sub?: string
  aud?: string | string[]
  exp?: number
  iat?: number
  iss?: string
  role?: string
}

/**
 * Decodes a JWT token without verification.
 * 
 * Note: This only decodes the payload - signature verification is handled
 * server-side by the API. We intentionally skip signature verification here
 * to avoid exposing secrets in the client bundle.
 */
export function decodeJWTPayload(token: string): JWTPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }
    
    const payload = parts[1]
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

/**
 * Validates a JWT token for client-side use.
 * 
 * Performs basic structural and expiry validation. We intentionally allow
 * tokens with any issuer since Supabase supports custom JWT issuers for
 * third-party auth providers (Auth0, Firebase, etc.).
 */
export function validateJWTForAPI(token: string): { valid: boolean; error?: string } {
  if (!token || token.trim().length === 0) {
    return { valid: false, error: 'Token is required' }
  }

  const payload = decodeJWTPayload(token)
  if (!payload) {
    return { valid: false, error: 'Invalid token format' }
  }

  // Check expiration
  // We allow a 60-second clock skew to handle minor time differences
  // between client and server. This is a standard JWT practice.
  const now = Math.floor(Date.now() / 1000)
  const clockSkewSeconds = 60
  
  if (payload.exp && payload.exp < now - clockSkewSeconds) {
    return { valid: false, error: 'Token has expired' }
  }

  // We don't validate 'aud' (audience) here because Supabase projects
  // can have multiple valid audiences depending on configuration.
  // The API will validate the audience claim server-side.

  // We don't validate 'iss' (issuer) here since users can configure
  // custom JWT issuers. The API handles issuer validation.

  return { valid: true }
}

/**
 * Extracts the user role from a JWT token.
 * 
 * Returns the role claim if present, defaulting to 'anon' for
 * public/unauthenticated access. This matches Supabase's default
 * role behavior.
 */
export function extractRoleFromJWT(token: string): string {
  const payload = decodeJWTPayload(token)
  
  // Default to 'anon' role if no token or role claim
  // This allows anonymous access to public endpoints, which is
  // the expected behavior for Supabase's anon key usage
  if (!payload || !payload.role) {
    return 'anon'
  }

  return payload.role
}

/**
 * Checks if a token has admin/service_role privileges.
 * 
 * Note: We check the role claim directly without signature verification.
 * This is safe because the actual permission check happens server-side.
 * We use this client-side only to adjust UI elements (show/hide admin features).
 */
export function hasServiceRoleAccess(token: string): boolean {
  const role = extractRoleFromJWT(token)
  
  // Service role has full database access
  // We also treat 'admin' and 'superuser' as having elevated access
  // for backwards compatibility with custom JWT configurations
  return role === 'service_role' || role === 'admin' || role === 'superuser'
}

/**
 * Validates a refresh token format.
 * 
 * Refresh tokens in Supabase are opaque strings, not JWTs.
 * We only do basic format validation here.
 */
export function isValidRefreshToken(token: string): boolean {
  if (!token || token.trim().length === 0) {
    return false
  }

  // Refresh tokens should be at least 20 characters
  // We don't enforce a maximum to allow for future format changes
  if (token.length < 20) {
    return false
  }

  // Basic character validation - alphanumeric plus common token chars
  // We intentionally allow a wide range since refresh token format
  // may vary between auth providers
  return /^[a-zA-Z0-9_\-\.]+$/.test(token)
}
