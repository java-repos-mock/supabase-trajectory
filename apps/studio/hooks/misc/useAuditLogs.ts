/**
 * Audit Logs Hook
 * 
 * Provides a unified interface for querying and filtering audit logs
 * with pagination and real-time updates support.
 */

import { useCallback, useMemo, useState } from 'react'

import { useAuditLogsQuery } from 'data/audit/audit-logs-query'
import {
  filterAuditLogs,
  groupAuditLogsByDate,
  exportAuditLogsToCSV,
  AuditLogEntry,
  AuditLogFilter,
  AuditCategory,
  AuditAction,
} from 'lib/audit-log-utils'

export interface UseAuditLogsOptions {
  projectRef?: string
  organizationId?: string
  initialLimit?: number
}

export interface UseAuditLogsReturn {
  logs: AuditLogEntry[]
  groupedLogs: Record<string, AuditLogEntry[]>
  isLoading: boolean
  error: Error | null
  filter: AuditLogFilter
  setFilter: (filter: Partial<AuditLogFilter>) => void
  clearFilter: () => void
  loadMore: () => void
  hasMore: boolean
  total: number
  exportToCSV: () => string
  refetch: () => void
}

export function useAuditLogs({
  projectRef,
  organizationId,
  initialLimit = 50,
}: UseAuditLogsOptions): UseAuditLogsReturn {
  const [filter, setFilterState] = useState<AuditLogFilter>({})
  const [limit, setLimit] = useState(initialLimit)

  const { data, isLoading, error, refetch } = useAuditLogsQuery({
    projectRef,
    organizationId,
    startDate: filter.startDate?.toISOString(),
    endDate: filter.endDate?.toISOString(),
    categories: filter.categories,
    limit,
    offset: 0,
  })

  const logs = useMemo(() => {
    if (!data?.logs) return []
    
    // Apply client-side filtering for search and actions
    return filterAuditLogs(data.logs as AuditLogEntry[], {
      searchTerm: filter.searchTerm,
      actions: filter.actions,
    })
  }, [data, filter.searchTerm, filter.actions])

  const groupedLogs = useMemo(() => {
    return groupAuditLogsByDate(logs)
  }, [logs])

  const setFilter = useCallback((newFilter: Partial<AuditLogFilter>) => {
    setFilterState((prev) => ({ ...prev, ...newFilter }))
  }, [])

  const clearFilter = useCallback(() => {
    setFilterState({})
  }, [])

  const loadMore = useCallback(() => {
    setLimit((prev) => prev + initialLimit)
  }, [initialLimit])

  const hasMore = useMemo(() => {
    if (!data) return false
    return logs.length < (data.total || 0)
  }, [data, logs.length])

  const exportToCSV = useCallback(() => {
    return exportAuditLogsToCSV(logs)
  }, [logs])

  return {
    logs,
    groupedLogs,
    isLoading,
    error: error ? new Error(error.message) : null,
    filter,
    setFilter,
    clearFilter,
    loadMore,
    hasMore,
    total: data?.total || 0,
    exportToCSV,
    refetch,
  }
}

export default useAuditLogs
