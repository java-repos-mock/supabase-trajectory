/**
 * Cache Helpers for React Query
 * 
 * Provides utility functions for common cache operations
 * used across data fetching modules.
 */

import { QueryClient, QueryKey } from '@tanstack/react-query'

/**
 * Optimistically updates a query's cached data
 */
export function optimisticUpdate<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  updater: (old: T | undefined) => T
): { previousData: T | undefined; rollback: () => void } {
  const previousData = queryClient.getQueryData<T>(queryKey)
  
  queryClient.setQueryData<T>(queryKey, updater)
  
  return {
    previousData,
    rollback: () => {
      queryClient.setQueryData<T>(queryKey, previousData)
    },
  }
}

/**
 * Adds an item to a cached list
 */
export function addToListCache<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  newItem: T,
  prepend: boolean = false
): void {
  queryClient.setQueryData<T[]>(queryKey, (old) => {
    if (!old) return [newItem]
    return prepend ? [newItem, ...old] : [...old, newItem]
  })
}

/**
 * Removes an item from a cached list by predicate
 */
export function removeFromListCache<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  predicate: (item: T) => boolean
): void {
  queryClient.setQueryData<T[]>(queryKey, (old) => {
    if (!old) return []
    return old.filter((item) => !predicate(item))
  })
}

/**
 * Updates an item in a cached list
 */
export function updateInListCache<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  predicate: (item: T) => boolean,
  updater: (item: T) => T
): void {
  queryClient.setQueryData<T[]>(queryKey, (old) => {
    if (!old) return []
    return old.map((item) => (predicate(item) ? updater(item) : item))
  })
}

/**
 * Checks if a query has cached data
 */
export function hasCachedData(
  queryClient: QueryClient,
  queryKey: QueryKey
): boolean {
  return queryClient.getQueryData(queryKey) !== undefined
}

/**
 * Gets the age of cached data in milliseconds
 */
export function getCacheAge(
  queryClient: QueryClient,
  queryKey: QueryKey
): number | null {
  const state = queryClient.getQueryState(queryKey)
  if (!state?.dataUpdatedAt) return null
  return Date.now() - state.dataUpdatedAt
}

/**
 * Waits for a query to have data (or timeout)
 */
export async function waitForQueryData<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  timeoutMs: number = 5000
): Promise<T | undefined> {
  const existing = queryClient.getQueryData<T>(queryKey)
  if (existing !== undefined) return existing

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      unsubscribe()
      resolve(undefined)
    }, timeoutMs)

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.query.queryKey === queryKey &&
        event.action.type === 'success'
      ) {
        clearTimeout(timeout)
        unsubscribe()
        resolve(queryClient.getQueryData<T>(queryKey))
      }
    })
  })
}

/**
 * Creates a cache warmer that prefetches data in the background
 */
export function createCacheWarmer(
  queryClient: QueryClient,
  queries: Array<{
    queryKey: QueryKey
    queryFn: () => Promise<unknown>
    staleTime?: number
  }>
): () => Promise<void> {
  return async () => {
    await Promise.allSettled(
      queries.map(({ queryKey, queryFn, staleTime }) =>
        queryClient.prefetchQuery({
          queryKey,
          queryFn,
          staleTime: staleTime ?? 5 * 60 * 1000, // Default 5 minutes
        })
      )
    )
  }
}

/**
 * Invalidates queries matching a partial key
 */
export async function invalidateByPartialKey(
  queryClient: QueryClient,
  partialKey: unknown[]
): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const queryKey = query.queryKey
      return partialKey.every((part, index) => queryKey[index] === part)
    },
  })
}

/**
 * Removes stale queries from cache
 */
export function pruneStaleQueries(
  queryClient: QueryClient,
  maxAge: number = 30 * 60 * 1000 // 30 minutes default
): number {
  const cache = queryClient.getQueryCache()
  const queries = cache.getAll()
  let pruned = 0

  queries.forEach((query) => {
    const age = Date.now() - (query.state.dataUpdatedAt || 0)
    if (age > maxAge && query.getObserversCount() === 0) {
      cache.remove(query)
      pruned++
    }
  })

  return pruned
}
