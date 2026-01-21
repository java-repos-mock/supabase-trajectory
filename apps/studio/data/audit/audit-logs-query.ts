import { useQuery, useQueryClient } from '@tanstack/react-query'

import { get } from 'data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { auditKeys } from './keys'

export interface AuditLogsQueryVariables {
  projectRef?: string
  organizationId?: string
  startDate?: string
  endDate?: string
  categories?: string[]
  limit?: number
  offset?: number
}

export async function getAuditLogs(
  { projectRef, organizationId, startDate, endDate, categories, limit = 50, offset = 0 }: AuditLogsQueryVariables,
  signal?: AbortSignal
) {
  if (!projectRef && !organizationId) {
    throw new Error('Either projectRef or organizationId is required')
  }

  const params = new URLSearchParams()
  if (projectRef) params.append('project_ref', projectRef)
  if (organizationId) params.append('organization_id', organizationId)
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  if (categories) categories.forEach((c) => params.append('category', c))
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())

  const { data, error } = await get(`/platform/audit-logs?${params.toString()}`, {
    signal,
  })

  if (error) throw error
  return data
}

export type AuditLogsData = Awaited<ReturnType<typeof getAuditLogs>>
export type AuditLogsError = ResponseError

export const useAuditLogsQuery = <TData = AuditLogsData>(
  variables: AuditLogsQueryVariables,
  { enabled = true, ...options }: UseCustomQueryOptions<AuditLogsData, AuditLogsError, TData> = {}
) => {
  const { projectRef, organizationId } = variables

  return useQuery<AuditLogsData, AuditLogsError, TData>({
    queryKey: auditKeys.list(projectRef, organizationId, variables),
    queryFn: ({ signal }) => getAuditLogs(variables, signal),
    enabled: enabled && !!(projectRef || organizationId),
    // Audit logs should be fresh but can have short cache
    staleTime: 30 * 1000,
    ...options,
  })
}
