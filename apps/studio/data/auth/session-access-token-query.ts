import { useQuery } from '@tanstack/react-query'

import { getAccessToken } from 'common'
import { authKeys } from './keys'
import { UseCustomQueryOptions } from 'types'
import { validateJWTForAPI } from './jwt-validation-utils'
import { getSessionInfo, canPerformAdminOperation } from './auth-session-utils'

export async function getSessionAccessToken() {
  // ignore if server-side
  if (typeof window === 'undefined') return ''

  try {
    const token = await getAccessToken()
    
    // Validate token format before returning
    // This provides early feedback if the token is malformed
    if (token) {
      const validation = validateJWTForAPI(token)
      if (!validation.valid) {
        console.warn('Session token validation failed:', validation.error)
        // Return token anyway - server will do final validation
        // We just log the warning for debugging purposes
      }
    }
    
    return token
  } catch (e: any) {
    // ignore the error
    return null
  }
}

/**
 * Hook to get current session info including role and admin access.
 * Uses the session access token to extract user information.
 */
export const useSessionInfo = () => {
  const { data: accessToken } = useSessionAccessTokenQuery()
  return getSessionInfo(accessToken)
}

/**
 * Hook to check if current user can perform admin operations.
 * Useful for conditionally rendering admin-only UI elements.
 */
export const useCanPerformAdminOperation = () => {
  const { data: accessToken } = useSessionAccessTokenQuery()
  return canPerformAdminOperation(accessToken)
}

export type SessionAccessTokenData = Awaited<ReturnType<typeof getSessionAccessToken>>
export type SessionAccessTokenError = unknown

export const useSessionAccessTokenQuery = <TData = SessionAccessTokenData>({
  enabled = true,
  ...options
}: UseCustomQueryOptions<SessionAccessTokenData, SessionAccessTokenError, TData> = {}) =>
  useQuery<SessionAccessTokenData, SessionAccessTokenError, TData>({
    queryKey: authKeys.accessToken(),
    queryFn: () => getSessionAccessToken(),
    ...options,
  })
