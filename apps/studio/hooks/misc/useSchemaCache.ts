import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { useParams } from 'common'
import { databaseKeys } from 'data/database/keys'

interface SchemaCacheEntry {
  tables: string[]
  views: string[]
  functions: string[]
  lastUpdated: number
}

interface SchemaCache {
  [schema: string]: SchemaCacheEntry
}

const CACHE_KEY = 'supabase-schema-metadata-cache'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Hook for caching schema metadata to localStorage.
 * 
 * Improves performance by caching schema information locally
 * to avoid redundant API calls when switching between schemas.
 * Cache is automatically invalidated after TTL expires.
 */
export function useSchemaCache() {
  const { ref: projectRef } = useParams()
  const queryClient = useQueryClient()
  const cacheRef = useRef<SchemaCache | null>(null)

  // Load cache from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CACHE_KEY)
      if (stored) {
        cacheRef.current = JSON.parse(stored)
      }
    } catch {
      // Ignore parse errors, start with empty cache
      cacheRef.current = null
    }
  }, [])

  // Get cached schema data, returns null if expired or not found
  const getCachedSchema = useCallback((schema: string): SchemaCacheEntry | null => {
    if (!cacheRef.current) return null
    
    const entry = cacheRef.current[schema]
    if (!entry) return null

    // Check if cache is still valid
    const isExpired = Date.now() - entry.lastUpdated > CACHE_TTL_MS
    if (isExpired) {
      // Remove expired entry
      delete cacheRef.current[schema]
      persistCache()
      return null
    }

    return entry
  }, [])

  // Cache schema data
  const setCachedSchema = useCallback((
    schema: string, 
    data: Omit<SchemaCacheEntry, 'lastUpdated'>
  ) => {
    if (!cacheRef.current) {
      cacheRef.current = {}
    }

    cacheRef.current[schema] = {
      ...data,
      lastUpdated: Date.now(),
    }

    persistCache()
  }, [])

  // Persist cache to localStorage
  const persistCache = useCallback(() => {
    try {
      if (cacheRef.current) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheRef.current))
      }
    } catch {
      // Ignore storage errors (quota exceeded, etc.)
    }
  }, [])

  // Clear cache for current project and invalidate queries
  const clearCache = useCallback(() => {
    cacheRef.current = null
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch {
      // Ignore errors
    }

    // Invalidate related queries
    if (projectRef) {
      queryClient.invalidateQueries({ 
        queryKey: databaseKeys.schemas(projectRef) 
      })
    }
  }, [projectRef, queryClient])

  // Prefetch and cache schema data
  const prefetchSchema = useCallback(async (schema: string) => {
    // Skip if already cached and valid
    if (getCachedSchema(schema)) return

    // Fetch from React Query cache if available
    const queryKey = databaseKeys.schemas(projectRef)
    const cachedData = queryClient.getQueryData<any[]>(queryKey)
    
    if (cachedData) {
      const schemaData = cachedData.find((s: any) => s.name === schema)
      if (schemaData) {
        setCachedSchema(schema, {
          tables: schemaData.tables || [],
          views: schemaData.views || [],
          functions: schemaData.functions || [],
        })
      }
    }
  }, [projectRef, queryClient, getCachedSchema, setCachedSchema])

  return {
    getCachedSchema,
    setCachedSchema,
    clearCache,
    prefetchSchema,
  }
}
