import { useSessionRefresh } from 'hooks/misc/useSessionRefresh'
import { IS_PLATFORM } from 'lib/constants'

/**
 * Manages proactive session refresh to prevent token expiration
 * during long editing sessions.
 */
export function SessionRefreshManager() {
  useSessionRefresh({
    enabled: IS_PLATFORM,
    onRefresh: () => {
      console.debug('[SessionRefresh] Session refreshed successfully')
    },
    onError: (error) => {
      console.warn('[SessionRefresh] Session refresh failed:', error.message)
    },
  })

  // This component doesn't render anything
  return null
}
