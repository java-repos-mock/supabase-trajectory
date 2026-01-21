/**
 * Query Cache Utilities
 * 
 * Provides helpers for managing React Query cache behavior including
 * stale time calculations, cache key generation, and invalidation strategies.
 */

import { QueryClient } from '@tanstack/react-query'

// Cache duration constants (in milliseconds)
export const CACHE_DURATIONS = {
  /** Real-time data that should never be cached */
  NONE: 0,
  /** Short cache for frequently changing data (30 seconds) */
  SHORT: 30 * 1000,
  /** Medium cache for moderately stable data (5 minutes) */
  MEDIUM: 5 * 60 * 1000,
  /** Long cache for stable data (30 minutes) */
  LONG: 30 * 60 * 1000,
  /** Extended cache for very stable data (1 hour) */
  EXTENDED: 60 * 60 * 1000,
  /** Session cache - data cached for entire session (24 hours) */
  SESSION: 24 * 60 * 60 * 1000,
} as const

// Query categories with recommended cache durations
export const QUERY_CACHE_POLICIES = {
  // User and auth data - needs to be fresh
  auth: CACHE_DURATIONS.NONE,
  profile: CACHE_DURATIONS.LONG,
  
  // Project data - moderately stable
  projects: CACHE_DURATIONS.MEDIUM,
  projectSettings: CACHE_DURATIONS.MEDIUM,
  
  // Database schema - relatively stable
  tables: CACHE_DURATIONS.MEDIUM,
  columns: CACHE_DURATIONS.MEDIUM,
  schemas: CACHE_DURATIONS.LONG,
  
  // Runtime data - should not be cached
  tableRows: CACHE_DURATIONS.NONE,
  logs: CACHE_DURATIONS.NONE,
  metrics: CACHE_DURATIONS.SHORT,
  
  // Configuration - stable
  roles: CACHE_DURATIONS.LONG,
  policies: CACHE_DURATIONS.MEDIUM,
  functions: CACHE_DURATIONS.MEDIUM,
  
  // Billing - can be cached
  subscription: CACHE_DURATIONS.EXTENDED,
  usage: CACHE_DURATIONS.EXTENDED,
  invoices: CACHE_DURATIONS.EXTENDED,
} as const

export type QueryCategory = keyof typeof QUERY_CACHE_POLICIES

/**
 * Gets the recommended stale time for a query category
 */
export function getStaleTimeForCategory(category: QueryCategory): number {
  return QUERY_CACHE_POLICIES[category]
}

/**
 * Creates a standardized query key with project context
 */
export function createProjectQueryKey(
  projectRef: string | undefined,
  ...parts: (string | number | Record<string, unknown>)[]
): readonly unknown[] {
  return ['projects', projectRef, ...parts] as const
}

/**
 * Creates a standardized query key for organization context
 */
export function createOrgQueryKey(
  orgSlug: string | undefined,
  ...parts: (string | number | Record<string, unknown>)[]
): readonly unknown[] {
  return ['organizations', orgSlug, ...parts] as const
}

/**
 * Generates a cache key for table-related queries
 */
export function createTableQueryKey(
  projectRef: string | undefined,
  schema: string,
  table: string,
  operation?: string
): readonly unknown[] {
  const key = createProjectQueryKey(projectRef, 'tables', { schema, table })
  return operation ? [...key, operation] : key
}

/**
 * Invalidates all queries related to a specific table
 */
export async function invalidateTableQueries(
  queryClient: QueryClient,
  projectRef: string,
  schema: string,
  table: string
): Promise<void> {
  await Promise.all([
    // Invalidate table definition
    queryClient.invalidateQueries({
      queryKey: createTableQueryKey(projectRef, schema, table),
    }),
    // Invalidate table rows
    queryClient.invalidateQueries({
      queryKey: createProjectQueryKey(projectRef, 'table-rows', { schema, table }),
    }),
    // Invalidate table columns
    queryClient.invalidateQueries({
      queryKey: createProjectQueryKey(projectRef, 'columns', { schema, table }),
    }),
  ])
}

/**
 * Invalidates all queries related to a schema
 */
export async function invalidateSchemaQueries(
  queryClient: QueryClient,
  projectRef: string,
  schema: string
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: createProjectQueryKey(projectRef, 'schemas', schema),
    exact: false,
  })
}

/**
 * Prefetches common project data
 */
export async function prefetchProjectData(
  queryClient: QueryClient,
  projectRef: string,
  fetchers: {
    fetchTables?: () => Promise<unknown>
    fetchSchemas?: () => Promise<unknown>
    fetchRoles?: () => Promise<unknown>
  }
): Promise<void> {
  const prefetches: Promise<unknown>[] = []

  if (fetchers.fetchTables) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: createProjectQueryKey(projectRef, 'tables'),
        queryFn: fetchers.fetchTables,
        staleTime: QUERY_CACHE_POLICIES.tables,
      })
    )
  }

  if (fetchers.fetchSchemas) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: createProjectQueryKey(projectRef, 'schemas'),
        queryFn: fetchers.fetchSchemas,
        staleTime: QUERY_CACHE_POLICIES.schemas,
      })
    )
  }

  if (fetchers.fetchRoles) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: createProjectQueryKey(projectRef, 'roles'),
        queryFn: fetchers.fetchRoles,
        staleTime: QUERY_CACHE_POLICIES.roles,
      })
    )
  }

  await Promise.all(prefetches)
}

/**
 * Determines if a query should be refetched based on its staleness
 */
export function shouldRefetch(
  lastUpdated: number | undefined,
  staleTime: number
): boolean {
  if (lastUpdated === undefined) return true
  return Date.now() - lastUpdated > staleTime
}

/**
 * Creates a deduplication key for preventing duplicate requests
 */
export function createDedupeKey(
  ...parts: (string | number | undefined)[]
): string {
  return parts.filter(Boolean).join(':')
}

/**
 * Batch invalidates multiple query keys
 */
export async function batchInvalidate(
  queryClient: QueryClient,
  keys: readonly unknown[][]
): Promise<void> {
  await Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  )
}

/**
 * Clears all cached data for a project
 */
export async function clearProjectCache(
  queryClient: QueryClient,
  projectRef: string
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: ['projects', projectRef],
    exact: false,
  })
}

/**
 * Gets cache statistics for debugging
 */
export function getCacheStats(queryClient: QueryClient): {
  totalQueries: number
  staleQueries: number
  activeQueries: number
} {
  const cache = queryClient.getQueryCache()
  const queries = cache.getAll()
  
  return {
    totalQueries: queries.length,
    staleQueries: queries.filter((q) => q.isStale()).length,
    activeQueries: queries.filter((q) => q.getObserversCount() > 0).length,
  }
}
