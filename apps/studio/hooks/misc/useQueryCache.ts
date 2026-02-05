/**
 * Query Cache Management Hook
 * 
 * Provides utilities for managing React Query cache state
 * including prefetching, invalidation, and cache statistics.
 */

import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  CACHE_DURATIONS,
  QUERY_CACHE_POLICIES,
  createProjectQueryKey,
  invalidateTableQueries,
  clearProjectCache,
  getCacheStats,
  QueryCategory,
} from 'lib/query-cache-utils'
import {
  optimisticUpdate,
  hasCachedData,
  getCacheAge,
  pruneStaleQueries,
} from 'data/utils/cache-helpers'

export interface UseQueryCacheOptions {
  projectRef?: string
}

export interface UseQueryCacheReturn {
  /** Invalidate all caches for a table */
  invalidateTable: (schema: string, table: string) => Promise<void>
  /** Clear all project cache */
  clearCache: () => Promise<void>
  /** Check if data is cached */
  isCached: (key: readonly unknown[]) => boolean
  /** Get cache age in ms */
  getAge: (key: readonly unknown[]) => number | null
  /** Prune old stale queries */
  pruneStale: (maxAge?: number) => number
  /** Get cache statistics */
  getStats: () => { totalQueries: number; staleQueries: number; activeQueries: number }
  /** Get recommended stale time for category */
  getStaleTime: (category: QueryCategory) => number
  /** Perform optimistic update */
  optimisticUpdate: <T>(key: readonly unknown[], updater: (old: T | undefined) => T) => { previousData: T | undefined; rollback: () => void }
  /** Cache duration constants */
  durations: typeof CACHE_DURATIONS
}

export function useQueryCache({
  projectRef,
}: UseQueryCacheOptions = {}): UseQueryCacheReturn {
  const queryClient = useQueryClient()

  const invalidateTable = useCallback(
    async (schema: string, table: string) => {
      if (!projectRef) {
        console.warn('useQueryCache: projectRef required for invalidateTable')
        return
      }
      await invalidateTableQueries(queryClient, projectRef, schema, table)
    },
    [queryClient, projectRef]
  )

  const clearCache = useCallback(async () => {
    if (!projectRef) {
      console.warn('useQueryCache: projectRef required for clearCache')
      return
    }
    await clearProjectCache(queryClient, projectRef)
  }, [queryClient, projectRef])

  const isCached = useCallback(
    (key: readonly unknown[]) => hasCachedData(queryClient, key),
    [queryClient]
  )

  const getAge = useCallback(
    (key: readonly unknown[]) => getCacheAge(queryClient, key),
    [queryClient]
  )

  const pruneStale = useCallback(
    (maxAge?: number) => pruneStaleQueries(queryClient, maxAge),
    [queryClient]
  )

  const getStats = useCallback(
    () => getCacheStats(queryClient),
    [queryClient]
  )

  const getStaleTime = useCallback(
    (category: QueryCategory) => QUERY_CACHE_POLICIES[category],
    []
  )

  const doOptimisticUpdate = useCallback(
    <T>(key: readonly unknown[], updater: (old: T | undefined) => T) =>
      optimisticUpdate(queryClient, key, updater),
    [queryClient]
  )

  return {
    invalidateTable,
    clearCache,
    isCached,
    getAge,
    pruneStale,
    getStats,
    getStaleTime,
    optimisticUpdate: doOptimisticUpdate,
    durations: CACHE_DURATIONS,
  }
}

export default useQueryCache
