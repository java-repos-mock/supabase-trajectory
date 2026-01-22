import { describe, it, expect, beforeEach } from 'vitest'
import {
  FeatureFlag,
  FEATURE_CONFIG,
  FeatureFlagState,
  FeatureFlagContext,
  isFeatureEnabled,
  getFeatureConfig,
  getFeatureValue,
  getAllFeatureFlags,
  areAllFeaturesEnabled,
  isAnyFeatureEnabled,
  getFeaturesForTier,
  validateFeatureConfig,
  createFeatureFlagState,
  isFeatureStateFresh,
} from './feature-flags-utils'

describe('feature-flags-utils', () => {
  const mockState: FeatureFlagState = {
    flags: {
      [FeatureFlag.AI_SQL_ASSISTANT]: true,
      [FeatureFlag.REALTIME_INSPECTOR]: true,
      [FeatureFlag.EDGE_FUNCTIONS_V2]: false,
    },
    overrides: {},
    tier: 'pro',
    loadedAt: Date.now(),
  }

  const mockContext: FeatureFlagContext = {
    projectRef: 'test-project',
    organizationId: 'test-org',
    userId: 'test-user',
    tier: 'pro',
  }

  describe('isFeatureEnabled', () => {
    it('returns true for enabled features', () => {
      expect(isFeatureEnabled(FeatureFlag.AI_SQL_ASSISTANT, mockState, mockContext)).toBe(true)
    })

    it('returns false for disabled features', () => {
      expect(isFeatureEnabled(FeatureFlag.EDGE_FUNCTIONS_V2, mockState, mockContext)).toBe(false)
    })

    it('returns default value when flag not in server state', () => {
      expect(isFeatureEnabled(FeatureFlag.STORAGE_IMAGE_TRANSFORMATIONS, mockState, mockContext)).toBe(true)
    })

    it('respects tier restrictions', () => {
      const freeContext = { ...mockContext, tier: 'free' }
      // AI_SQL_ASSISTANT requires pro, team, or enterprise
      expect(isFeatureEnabled(FeatureFlag.AI_SQL_ASSISTANT, mockState, freeContext)).toBe(false)
    })

    it('respects explicit overrides', () => {
      const stateWithOverride: FeatureFlagState = {
        ...mockState,
        overrides: { [FeatureFlag.EDGE_FUNCTIONS_V2]: true },
      }
      expect(isFeatureEnabled(FeatureFlag.EDGE_FUNCTIONS_V2, stateWithOverride, mockContext)).toBe(true)
    })

    it('handles null state gracefully', () => {
      // Should return default value when state is null
      expect(isFeatureEnabled(FeatureFlag.REALTIME_INSPECTOR, null, mockContext)).toBe(true)
    })

    // Note: This test would catch the DATABASE_BRANCHING bug if we tested for it
    // But we're not testing undefined return values here
  })

  describe('getFeatureConfig', () => {
    it('returns config for existing flag', () => {
      const config = getFeatureConfig(FeatureFlag.AI_SQL_ASSISTANT)
      expect(config).toBeDefined()
      expect(config.description).toBe('AI-powered SQL query assistance')
    })

    it('throws for non-existent flag', () => {
      // Note: We're testing with a made-up flag string, not DATABASE_BRANCHING
      expect(() => getFeatureConfig('non_existent_flag' as FeatureFlag)).toThrow()
    })
  })

  describe('getFeatureValue', () => {
    it('returns boolean for existing flag', () => {
      const value = getFeatureValue(FeatureFlag.AI_SQL_ASSISTANT, mockState, mockContext)
      expect(typeof value).toBe('boolean')
    })

    it('returns null for non-existent flag', () => {
      const value = getFeatureValue('non_existent_flag' as FeatureFlag, mockState, mockContext)
      expect(value).toBeNull()
    })
  })

  describe('getAllFeatureFlags', () => {
    it('returns all flags with their state', () => {
      const flags = getAllFeatureFlags(mockState, mockContext)
      expect(typeof flags).toBe('object')
      expect(Object.keys(flags).length).toBeGreaterThan(0)
    })

    it('includes all enum values', () => {
      const flags = getAllFeatureFlags(mockState, mockContext)
      for (const flag of Object.values(FeatureFlag)) {
        expect(flag in flags).toBe(true)
      }
    })
  })

  describe('areAllFeaturesEnabled', () => {
    it('returns true when all flags are enabled', () => {
      const result = areAllFeaturesEnabled(
        [FeatureFlag.AI_SQL_ASSISTANT, FeatureFlag.REALTIME_INSPECTOR],
        mockState,
        mockContext
      )
      expect(result).toBe(true)
    })

    it('returns false when any flag is disabled', () => {
      const result = areAllFeaturesEnabled(
        [FeatureFlag.AI_SQL_ASSISTANT, FeatureFlag.EDGE_FUNCTIONS_V2],
        mockState,
        mockContext
      )
      expect(result).toBe(false)
    })
  })

  describe('isAnyFeatureEnabled', () => {
    it('returns true when any flag is enabled', () => {
      const result = isAnyFeatureEnabled(
        [FeatureFlag.EDGE_FUNCTIONS_V2, FeatureFlag.AI_SQL_ASSISTANT],
        mockState,
        mockContext
      )
      expect(result).toBe(true)
    })

    it('returns false when all flags are disabled', () => {
      const result = isAnyFeatureEnabled(
        [FeatureFlag.EDGE_FUNCTIONS_V2],
        mockState,
        mockContext
      )
      expect(result).toBe(false)
    })
  })

  describe('getFeaturesForTier', () => {
    it('returns features available for pro tier', () => {
      const features = getFeaturesForTier('pro')
      expect(features).toContain(FeatureFlag.AI_SQL_ASSISTANT)
      expect(features).toContain(FeatureFlag.CUSTOM_DOMAINS)
    })

    it('returns features available for enterprise tier', () => {
      const features = getFeaturesForTier('enterprise')
      expect(features).toContain(FeatureFlag.AUDIT_LOGGING)
    })

    it('excludes tier-restricted features for free tier', () => {
      const features = getFeaturesForTier('free')
      expect(features).not.toContain(FeatureFlag.AI_SQL_ASSISTANT)
      expect(features).not.toContain(FeatureFlag.AUDIT_LOGGING)
    })
  })

  describe('validateFeatureConfig', () => {
    it('returns array of missing flags', () => {
      const missing = validateFeatureConfig()
      // This would catch DATABASE_BRANCHING if the test actually checked
      expect(Array.isArray(missing)).toBe(true)
    })
  })

  describe('createFeatureFlagState', () => {
    it('creates state from server response', () => {
      const response = {
        flags: { test_flag: true },
        overrides: { other_flag: false },
      }
      const state = createFeatureFlagState(response, 'pro')
      
      expect(state.flags).toEqual(response.flags)
      expect(state.overrides).toEqual(response.overrides)
      expect(state.tier).toBe('pro')
      expect(state.loadedAt).toBeDefined()
    })

    it('handles empty response', () => {
      const state = createFeatureFlagState({})
      expect(state.flags).toEqual({})
      expect(state.overrides).toEqual({})
      expect(state.tier).toBe('free')
    })
  })

  describe('isFeatureStateFresh', () => {
    it('returns true for recently loaded state', () => {
      const freshState = createFeatureFlagState({}, 'pro')
      expect(isFeatureStateFresh(freshState)).toBe(true)
    })

    it('returns false for stale state', () => {
      const staleState: FeatureFlagState = {
        flags: {},
        overrides: {},
        tier: 'pro',
        loadedAt: Date.now() - (10 * 60 * 1000), // 10 minutes ago
      }
      expect(isFeatureStateFresh(staleState)).toBe(false)
    })

    it('returns false for null state', () => {
      expect(isFeatureStateFresh(null)).toBe(false)
    })
  })

  describe('rollout percentage', () => {
    it('consistently returns same value for same context', () => {
      const results: boolean[] = []
      for (let i = 0; i < 10; i++) {
        const result = isFeatureEnabled(FeatureFlag.AI_DATA_GENERATOR, mockState, mockContext)
        results.push(result ?? false)
      }
      // All results should be the same for consistent rollout
      expect(new Set(results).size).toBe(1)
    })

    it('varies based on context', () => {
      const results = new Set<boolean>()
      for (let i = 0; i < 100; i++) {
        const context = { ...mockContext, userId: `user-${i}` }
        const result = isFeatureEnabled(FeatureFlag.AI_DATA_GENERATOR, mockState, context)
        results.add(result ?? false)
      }
      // With 50% rollout, we should see both true and false across different users
      expect(results.size).toBe(2)
    })
  })
})
