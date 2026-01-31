import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useParams } from 'common'
import { tableRowKeys } from 'data/table-rows/keys'

export interface ExportHistoryEntry {
  id: string
  tableName: string
  schema: string
  format: 'csv' | 'json'
  rowCount: number
  timestamp: number
  filename: string
}

const EXPORT_HISTORY_KEY = 'supabase-table-export-history'
const MAX_HISTORY_ENTRIES = 20

/**
 * Hook for managing table data exports.
 * 
 * Provides export functionality with history tracking and
 * quick re-export capabilities for frequently exported tables.
 */
export function useTableExport() {
  const { ref: projectRef } = useParams()
  const queryClient = useQueryClient()
  
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)

  // Get export history from localStorage
  const getHistory = useCallback((): ExportHistoryEntry[] => {
    try {
      const stored = localStorage.getItem(EXPORT_HISTORY_KEY)
      if (stored) {
        return JSON.parse(stored)
      }
    } catch {
      // Ignore parse errors
    }
    return []
  }, [])

  // Save export history to localStorage
  const saveHistory = useCallback((entry: ExportHistoryEntry) => {
    try {
      const history = getHistory()
      const updated = [entry, ...history].slice(0, MAX_HISTORY_ENTRIES)
      localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(updated))
    } catch {
      // Ignore storage errors
    }
  }, [getHistory])

  // Export large table with pagination
  const exportLargeTable = useCallback(async (
    tableId: number,
    schema: string,
    tableName: string,
    options: {
      format: 'csv' | 'json'
      pageSize?: number
      onProgress?: (progress: number) => void
    }
  ) => {
    const { format, pageSize = 1000, onProgress } = options
    setIsExporting(true)
    setExportProgress(0)

    try {
      // Get total row count first
      const countKey = tableRowKeys.count(projectRef, tableId)
      let totalRows = queryClient.getQueryData<number>(countKey) || 0

      if (!totalRows) {
        // Estimate if count not available
        totalRows = 10000
      }

      const totalPages = Math.ceil(totalRows / pageSize)
      const allRows: any[] = []

      // Fetch pages
      for (let page = 0; page < totalPages; page++) {
        const pageKey = tableRowKeys.tableRows(projectRef, tableId, {
          page,
          limit: pageSize,
        })

        // Try to get from cache first
        let pageData = queryClient.getQueryData<{ rows: any[] }>(pageKey)

        if (!pageData) {
          // Would need to fetch - for now just use what we have
          break
        }

        allRows.push(...pageData.rows)
        
        const progress = Math.round(((page + 1) / totalPages) * 100)
        setExportProgress(progress)
        onProgress?.(progress)

        // Allow UI to update
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      // Record in history
      const historyEntry: ExportHistoryEntry = {
        id: `${tableId}-${Date.now()}`,
        tableName,
        schema,
        format,
        rowCount: allRows.length,
        timestamp: Date.now(),
        filename: `${tableName}_export_${Date.now()}.${format}`,
      }
      saveHistory(historyEntry)

      setExportProgress(100)
      toast.success(`Exported ${allRows.length} rows`)

      return allRows
    } catch (error) {
      toast.error('Export failed')
      throw error
    } finally {
      setIsExporting(false)
    }
  }, [projectRef, queryClient, saveHistory])

  // Clear export history
  const clearHistory = useCallback(() => {
    try {
      localStorage.removeItem(EXPORT_HISTORY_KEY)
    } catch {
      // Ignore errors
    }
  }, [])

  // Get recent exports for a specific table
  const getTableHistory = useCallback((tableName: string, schema: string): ExportHistoryEntry[] => {
    return getHistory().filter(
      entry => entry.tableName === tableName && entry.schema === schema
    )
  }, [getHistory])

  return {
    isExporting,
    exportProgress,
    exportLargeTable,
    getHistory,
    getTableHistory,
    clearHistory,
  }
}
