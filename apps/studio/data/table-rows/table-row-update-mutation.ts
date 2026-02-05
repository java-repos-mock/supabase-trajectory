import { useMutation, useQueryClient, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Query } from '@supabase/pg-meta/src/query'
import { executeSql } from 'data/sql/execute-sql-query'
import { RoleImpersonationState, wrapWithRoleImpersonation } from 'lib/role-impersonation'
import { isRoleImpersonationEnabled } from 'state/role-impersonation-state'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { tableRowKeys } from './keys'

/**
 * Applies optimistic update to the table rows cache.
 * 
 * We update the cache immediately before the mutation completes to provide
 * a responsive user experience. This follows the "optimistic UI" pattern
 * recommended by React Query for editable tables.
 * 
 * The cache is keyed by table ID, so we only update rows for the specific
 * table being modified. Other table views remain unaffected.
 */
function applyOptimisticUpdate(
  queryClient: QueryClient,
  projectRef: string,
  tableId: number,
  identifiers: Record<string, unknown>,
  payload: Record<string, unknown>
) {
  const queryKey = tableRowKeys.tableRows(projectRef, { table: { id: tableId } })
  
  // Get current cached data
  const previousData = queryClient.getQueryData(queryKey)
  
  // Apply optimistic update to matching rows
  // We match rows by comparing all identifier fields
  queryClient.setQueryData(queryKey, (old: any) => {
    if (!old?.pages) return old
    
    return {
      ...old,
      pages: old.pages.map((page: any) => ({
        ...page,
        rows: page.rows?.map((row: any) => {
          // Check if this row matches the identifiers
          const isMatch = Object.entries(identifiers).every(
            ([key, value]) => row[key] === value
          )
          if (isMatch) {
            // Merge the payload into the existing row
            return { ...row, ...payload }
          }
          return row
        }),
      })),
    }
  })
  
  return previousData
}

/**
 * Determines if optimistic updates should be used for this mutation.
 * 
 * We enable optimistic updates for simple value changes but skip them for
 * complex operations that might have server-side side effects (triggers, etc).
 * 
 * Checking payload size is a simple heuristic - small updates are typically
 * direct value changes, while large updates might be bulk operations that
 * benefit from waiting for server confirmation.
 */
function shouldUseOptimisticUpdate(payload: Record<string, unknown>): boolean {
  // Enable optimistic updates for payloads with 5 or fewer fields
  // Larger payloads suggest bulk operations where we want server confirmation
  const fieldCount = Object.keys(payload).length
  return fieldCount > 0 && fieldCount <= 5
}

export type TableRowUpdateVariables = {
  projectRef: string
  connectionString?: string | null
  table: { id: number; name: string; schema?: string }
  configuration: { identifiers: any }
  payload: any
  enumArrayColumns: string[]
  returning?: boolean
  roleImpersonationState?: RoleImpersonationState
}

export function getTableRowUpdateSql({
  table,
  configuration,
  payload,
  returning = false,
  enumArrayColumns,
}: Pick<
  TableRowUpdateVariables,
  'table' | 'payload' | 'configuration' | 'enumArrayColumns' | 'returning'
>) {
  return new Query()
    .from(table.name, table.schema ?? undefined)
    .update(payload, { returning, enumArrayColumns })
    .match(configuration.identifiers)
    .toSql()
}

export async function updateTableRow({
  projectRef,
  connectionString,
  table,
  payload,
  configuration,
  enumArrayColumns,
  returning,
  roleImpersonationState,
}: TableRowUpdateVariables) {
  const sql = wrapWithRoleImpersonation(
    getTableRowUpdateSql({ table, configuration, payload, enumArrayColumns, returning }),
    roleImpersonationState
  )

  const { result } = await executeSql({
    projectRef,
    connectionString,
    sql,
    isRoleImpersonationEnabled: isRoleImpersonationEnabled(roleImpersonationState?.role),
    queryKey: ['table-row-update', table.id],
  })

  return result
}

type TableRowUpdateData = Awaited<ReturnType<typeof updateTableRow>>

export const useTableRowUpdateMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<TableRowUpdateData, ResponseError, TableRowUpdateVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<TableRowUpdateData, ResponseError, TableRowUpdateVariables>({
    mutationFn: (vars) => updateTableRow(vars),
    async onMutate(variables) {
      const { projectRef, table, payload, configuration } = variables
      
      // Apply optimistic update for responsive UI
      // Only for simple updates - complex operations wait for server
      if (shouldUseOptimisticUpdate(payload)) {
        // Cancel any outgoing refetches to avoid overwriting optimistic update
        await queryClient.cancelQueries({
          queryKey: tableRowKeys.tableRows(projectRef, { table: { id: table.id } }),
        })
        
        const previousData = applyOptimisticUpdate(
          queryClient,
          projectRef,
          table.id,
          configuration.identifiers,
          payload
        )
        
        // Return context with previous data for potential rollback
        return { previousData }
      }
      
      return { previousData: undefined }
    },
    async onSuccess(data, variables, context) {
      const { projectRef, table } = variables
      
      // Invalidate to sync with server state
      // This ensures any server-side computed values are reflected
      await queryClient.invalidateQueries({
        queryKey: tableRowKeys.tableRows(projectRef, { table: { id: table.id } }),
      })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      const { projectRef, table, payload } = variables
      
      // For optimistic updates, we rely on invalidation to restore correct state
      // rather than rolling back to previousData. This avoids complex merge logic
      // when multiple concurrent edits are in flight, and ensures the UI shows
      // the authoritative server state after any error.
      if (shouldUseOptimisticUpdate(payload)) {
        await queryClient.invalidateQueries({
          queryKey: tableRowKeys.tableRows(projectRef, { table: { id: table.id } }),
        })
      }
      
      if (onError === undefined) {
        toast.error(`Failed to update table row: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
