import { ReactNode } from 'react'
import { useFeatureFlags } from 'hooks/misc/useFeatureFlags'
import { FeatureFlag } from 'lib/feature-flags-utils'

export interface FeatureFlagGateProps {
  /**
   * Feature flag(s) to check. If array, ALL must be enabled.
   */
  flag: FeatureFlag | FeatureFlag[]
  
  /**
   * Content to render when feature is enabled.
   */
  children: ReactNode
  
  /**
   * Content to render when feature is disabled.
   */
  fallback?: ReactNode
  
  /**
   * Content to render while loading.
   * If not provided, renders fallback (or nothing).
   */
  loadingFallback?: ReactNode
  
  /**
   * If true, show children when ANY flag is enabled (instead of ALL).
   */
  matchAny?: boolean
  
  /**
   * Project reference override.
   */
  projectRef?: string
  
  /**
   * Organization ID override.
   */
  organizationId?: string
}

/**
 * Conditionally render content based on feature flag state.
 * 
 * @example
 * <FeatureFlagGate flag={FeatureFlag.AI_SQL_ASSISTANT}>
 *   <AIAssistantPanel />
 * </FeatureFlagGate>
 * 
 * @example
 * <FeatureFlagGate 
 *   flag={[FeatureFlag.TEAM_COLLABORATION, FeatureFlag.REALTIME_INSPECTOR]}
 *   fallback={<UpgradePrompt />}
 * >
 *   <CollaborationPanel />
 * </FeatureFlagGate>
 */
export function FeatureFlagGate({
  flag,
  children,
  fallback = null,
  loadingFallback,
  matchAny = false,
  projectRef,
  organizationId,
}: FeatureFlagGateProps) {
  const { isEnabled, areAllEnabled, isAnyEnabled, isLoading } = useFeatureFlags({
    projectRef,
    organizationId,
  })

  // Handle loading state
  // BUG: If loadingFallback not provided, shows fallback during load
  // This causes flash: fallback -> children (if enabled)
  // Should probably show nothing or children during load for better UX
  if (isLoading) {
    return <>{loadingFallback ?? fallback}</>
  }

  const flags = Array.isArray(flag) ? flag : [flag]
  
  // Check if feature(s) are enabled
  const isFeatureEnabled = matchAny
    ? isAnyEnabled(flags)
    : flags.length === 1
      ? isEnabled(flags[0])
      : areAllEnabled(flags)

  if (isFeatureEnabled) {
    return <>{children}</>
  }

  return <>{fallback}</>
}

/**
 * Higher-order component for feature flag gating.
 * 
 * @example
 * const ProtectedComponent = withFeatureFlag(
 *   MyComponent,
 *   FeatureFlag.ADVANCED_ANALYTICS
 * )
 */
export function withFeatureFlag<P extends object>(
  Component: React.ComponentType<P>,
  flag: FeatureFlag | FeatureFlag[],
  options: {
    fallback?: ReactNode
    matchAny?: boolean
  } = {}
) {
  return function FeatureFlaggedComponent(props: P) {
    return (
      <FeatureFlagGate
        flag={flag}
        fallback={options.fallback}
        matchAny={options.matchAny}
      >
        <Component {...props} />
      </FeatureFlagGate>
    )
  }
}

export default FeatureFlagGate
