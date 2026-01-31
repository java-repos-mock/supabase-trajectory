import { useState, useCallback, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'

export interface QueryFavorite {
  id: string
  name: string
  sql: string
  description?: string
  createdAt: number
  lastUsedAt: number
  useCount: number
  tags?: string[]
}

// Storage key for query favorites
// Shared across workspace for easy access to common queries
const FAVORITES_STORAGE_KEY = 'supabase-sql-query-favorites'
const MAX_FAVORITES = 50

/**
 * Hook for managing SQL query favorites.
 * 
 * Provides functionality to save, organize, and quickly access
 * frequently used SQL queries. Favorites are persisted to
 * localStorage for convenience across browser sessions.
 */
export function useQueryFavorites() {
  const [favorites, setFavorites] = useState<QueryFavorite[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  // Load favorites from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        // Validate and migrate old format if needed
        const validated = parsed.filter((f: any) => f.id && f.sql)
        setFavorites(validated)
      }
    } catch (error) {
      console.warn('Failed to load query favorites:', error)
    }
    setIsLoaded(true)
  }, [])

  // Persist favorites to localStorage
  const persistFavorites = useCallback((newFavorites: QueryFavorite[]) => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(newFavorites))
    } catch (error) {
      console.warn('Failed to save query favorites:', error)
    }
  }, [])

  // Add a new favorite
  const addFavorite = useCallback((
    sql: string,
    name?: string,
    options?: { description?: string; tags?: string[] }
  ): QueryFavorite => {
    const newFavorite: QueryFavorite = {
      id: uuidv4(),
      name: name || generateQueryName(sql),
      sql: sql.trim(),
      description: options?.description,
      tags: options?.tags,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      useCount: 0,
    }

    setFavorites(prev => {
      // Remove oldest if at limit
      const updated = [newFavorite, ...prev].slice(0, MAX_FAVORITES)
      persistFavorites(updated)
      return updated
    })

    return newFavorite
  }, [persistFavorites])

  // Remove a favorite
  const removeFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const updated = prev.filter(f => f.id !== id)
      persistFavorites(updated)
      return updated
    })
  }, [persistFavorites])

  // Update a favorite
  const updateFavorite = useCallback((
    id: string,
    updates: Partial<Omit<QueryFavorite, 'id' | 'createdAt'>>
  ) => {
    setFavorites(prev => {
      const updated = prev.map(f => 
        f.id === id ? { ...f, ...updates } : f
      )
      persistFavorites(updated)
      return updated
    })
  }, [persistFavorites])

  // Record usage of a favorite (for sorting by frequency)
  const recordUsage = useCallback((id: string) => {
    setFavorites(prev => {
      const updated = prev.map(f => 
        f.id === id 
          ? { ...f, lastUsedAt: Date.now(), useCount: f.useCount + 1 }
          : f
      )
      persistFavorites(updated)
      return updated
    })
  }, [persistFavorites])

  // Check if a query is already favorited
  const isFavorited = useCallback((sql: string): boolean => {
    const normalizedSql = sql.trim().toLowerCase()
    return favorites.some(f => f.sql.trim().toLowerCase() === normalizedSql)
  }, [favorites])

  // Find a favorite by SQL
  const findBySql = useCallback((sql: string): QueryFavorite | undefined => {
    const normalizedSql = sql.trim().toLowerCase()
    return favorites.find(f => f.sql.trim().toLowerCase() === normalizedSql)
  }, [favorites])

  // Get favorites sorted by usage
  const sortedByUsage = useCallback((): QueryFavorite[] => {
    return [...favorites].sort((a, b) => b.useCount - a.useCount)
  }, [favorites])

  // Get favorites sorted by recent
  const sortedByRecent = useCallback((): QueryFavorite[] => {
    return [...favorites].sort((a, b) => b.lastUsedAt - a.lastUsedAt)
  }, [favorites])

  // Search favorites
  const searchFavorites = useCallback((query: string): QueryFavorite[] => {
    const lowerQuery = query.toLowerCase()
    return favorites.filter(f => 
      f.name.toLowerCase().includes(lowerQuery) ||
      f.sql.toLowerCase().includes(lowerQuery) ||
      f.description?.toLowerCase().includes(lowerQuery) ||
      f.tags?.some(t => t.toLowerCase().includes(lowerQuery))
    )
  }, [favorites])

  // Clear all favorites
  const clearFavorites = useCallback(() => {
    setFavorites([])
    try {
      localStorage.removeItem(FAVORITES_STORAGE_KEY)
    } catch {
      // Ignore
    }
  }, [])

  return {
    favorites,
    isLoaded,
    addFavorite,
    removeFavorite,
    updateFavorite,
    recordUsage,
    isFavorited,
    findBySql,
    sortedByUsage,
    sortedByRecent,
    searchFavorites,
    clearFavorites,
  }
}

// Generate a name from SQL query
function generateQueryName(sql: string): string {
  const trimmed = sql.trim()
  const firstLine = trimmed.split('\n')[0]
  
  // Try to extract meaningful parts
  const selectMatch = firstLine.match(/SELECT\s+.+?\s+FROM\s+(\w+)/i)
  if (selectMatch) {
    return `Select from ${selectMatch[1]}`
  }

  const insertMatch = firstLine.match(/INSERT\s+INTO\s+(\w+)/i)
  if (insertMatch) {
    return `Insert into ${insertMatch[1]}`
  }

  const updateMatch = firstLine.match(/UPDATE\s+(\w+)/i)
  if (updateMatch) {
    return `Update ${updateMatch[1]}`
  }

  const deleteMatch = firstLine.match(/DELETE\s+FROM\s+(\w+)/i)
  if (deleteMatch) {
    return `Delete from ${deleteMatch[1]}`
  }

  // Fallback to truncated first line
  return firstLine.length > 40 ? firstLine.slice(0, 40) + '...' : firstLine
}
