import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

import {
  CACHE_DURATIONS,
  QUERY_CACHE_POLICIES,
  getStaleTimeForCategory,
  createProjectQueryKey,
  createOrgQueryKey,
  createTableQueryKey,
  invalidateTableQueries,
  shouldRefetch,
  createDedupeKey,
  getCacheStats,
} from './query-cache-utils'

describe('query-cache-utils', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  describe('CACHE_DURATIONS', () => {
    it('should have expected duration values', () => {
      expect(CACHE_DURATIONS.NONE).toBe(0)
      expect(CACHE_DURATIONS.SHORT).toBe(30 * 1000)
      expect(CACHE_DURATIONS.MEDIUM).toBe(5 * 60 * 1000)
      expect(CACHE_DURATIONS.LONG).toBe(30 * 60 * 1000)
      expect(CACHE_DURATIONS.EXTENDED).toBe(60 * 60 * 1000)
    })

    it('should have durations in ascending order', () => {
      expect(CACHE_DURATIONS.NONE).toBeLessThan(CACHE_DURATIONS.SHORT)
      expect(CACHE_DURATIONS.SHORT).toBeLessThan(CACHE_DURATIONS.MEDIUM)
      expect(CACHE_DURATIONS.MEDIUM).toBeLessThan(CACHE_DURATIONS.LONG)
      expect(CACHE_DURATIONS.LONG).toBeLessThan(CACHE_DURATIONS.EXTENDED)
    })
  })

  describe('QUERY_CACHE_POLICIES', () => {
    it('should have zero cache for real-time data', () => {
      expect(QUERY_CACHE_POLICIES.auth).toBe(CACHE_DURATIONS.NONE)
      expect(QUERY_CACHE_POLICIES.tableRows).toBe(CACHE_DURATIONS.NONE)
      expect(QUERY_CACHE_POLICIES.logs).toBe(CACHE_DURATIONS.NONE)
    })

    it('should have longer cache for stable data', () => {
      expect(QUERY_CACHE_POLICIES.schemas).toBe(CACHE_DURATIONS.LONG)
      expect(QUERY_CACHE_POLICIES.roles).toBe(CACHE_DURATIONS.LONG)
      expect(QUERY_CACHE_POLICIES.subscription).toBe(CACHE_DURATIONS.EXTENDED)
    })
  })

  describe('getStaleTimeForCategory', () => {
    it('should return correct stale time for auth', () => {
      expect(getStaleTimeForCategory('auth')).toBe(0)
    })

    it('should return correct stale time for tables', () => {
      expect(getStaleTimeForCategory('tables')).toBe(CACHE_DURATIONS.MEDIUM)
    })

    it('should return correct stale time for subscription', () => {
      expect(getStaleTimeForCategory('subscription')).toBe(CACHE_DURATIONS.EXTENDED)
    })
  })

  describe('createProjectQueryKey', () => {
    it('should create key with project ref', () => {
      const key = createProjectQueryKey('abc123', 'tables')
      expect(key).toEqual(['projects', 'abc123', 'tables'])
    })

    it('should handle undefined project ref', () => {
      const key = createProjectQueryKey(undefined, 'tables')
      expect(key).toEqual(['projects', undefined, 'tables'])
    })

    it('should include multiple parts', () => {
      const key = createProjectQueryKey('abc123', 'tables', { schema: 'public' })
      expect(key).toEqual(['projects', 'abc123', 'tables', { schema: 'public' }])
    })
  })

  describe('createOrgQueryKey', () => {
    it('should create key with org slug', () => {
      const key = createOrgQueryKey('my-org', 'members')
      expect(key).toEqual(['organizations', 'my-org', 'members'])
    })

    it('should handle undefined org slug', () => {
      const key = createOrgQueryKey(undefined, 'billing')
      expect(key).toEqual(['organizations', undefined, 'billing'])
    })
  })

  describe('createTableQueryKey', () => {
    it('should create key for table', () => {
      const key = createTableQueryKey('abc123', 'public', 'users')
      expect(key).toEqual(['projects', 'abc123', 'tables', { schema: 'public', table: 'users' }])
    })

    it('should include operation when provided', () => {
      const key = createTableQueryKey('abc123', 'public', 'users', 'columns')
      expect(key).toEqual(['projects', 'abc123', 'tables', { schema: 'public', table: 'users' }, 'columns'])
    })
  })

  describe('invalidateTableQueries', () => {
    it('should invalidate table-related queries', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      await invalidateTableQueries(queryClient, 'abc123', 'public', 'users')

      expect(invalidateSpy).toHaveBeenCalledTimes(3)
    })
  })

  describe('shouldRefetch', () => {
    it('should return true for undefined lastUpdated', () => {
      expect(shouldRefetch(undefined, 1000)).toBe(true)
    })

    it('should return false when within stale time', () => {
      const now = Date.now()
      expect(shouldRefetch(now - 500, 1000)).toBe(false)
    })

    it('should return true when past stale time', () => {
      const now = Date.now()
      expect(shouldRefetch(now - 2000, 1000)).toBe(true)
    })

    it('should handle zero stale time', () => {
      const now = Date.now()
      expect(shouldRefetch(now, 0)).toBe(true)
    })
  })

  describe('createDedupeKey', () => {
    it('should join parts with colon', () => {
      expect(createDedupeKey('a', 'b', 'c')).toBe('a:b:c')
    })

    it('should filter out undefined values', () => {
      expect(createDedupeKey('a', undefined, 'c')).toBe('a:c')
    })

    it('should handle numbers', () => {
      expect(createDedupeKey('table', 123)).toBe('table:123')
    })

    it('should return empty string for all undefined', () => {
      expect(createDedupeKey(undefined, undefined)).toBe('')
    })
  })

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      const stats = getCacheStats(queryClient)
      
      expect(stats).toHaveProperty('totalQueries')
      expect(stats).toHaveProperty('staleQueries')
      expect(stats).toHaveProperty('activeQueries')
      expect(typeof stats.totalQueries).toBe('number')
    })

    it('should count queries correctly', () => {
      // Set some data
      queryClient.setQueryData(['test1'], { data: 'test' })
      queryClient.setQueryData(['test2'], { data: 'test2' })
      
      const stats = getCacheStats(queryClient)
      expect(stats.totalQueries).toBe(2)
    })
  })
})
