import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { executeSql } from 'data/sql/execute-sql-query'
import { tableEditorKeys } from 'data/table-editor/keys'
import { lintKeys } from 'data/lint/keys'
import { generateColumnRenameSql, validateColumnName } from 'lib/database-column-utils'
import type { ResponseError, UseCustomMutationOptions } from 'types'

export type ColumnRenameVariables = {
  projectRef: string
  connectionString?: string | null
  schema: string
  table: string
  tableId: number
  oldName: string
  newName: string
}

/**
 * Renames a database column.
 * This operation updates the column name in the table definition and
 * automatically updates any indexes that reference the column.
 */
export async function renameColumn({
  projectRef,
  connectionString,
  schema,
  table,
  tableId,
  oldName,
  newName,
}: ColumnRenameVariables) {
  // Validate the new column name
  const validation = validateColumnName(newName)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  const sql = generateColumnRenameSql(schema, table, oldName, newName)

  const { result } = await executeSql({
    projectRef,
    connectionString,
    sql,
    queryKey: ['column', 'rename', schema, table, oldName, newName],
  })

  return result
}

type ColumnRenameData = Awaited<ReturnType<typeof renameColumn>>

export const useColumnRenameMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<ColumnRenameData, ResponseError, ColumnRenameVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<ColumnRenameData, ResponseError, ColumnRenameVariables>({
    mutationFn: (vars) => renameColumn(vars),
    async onSuccess(data, variables, context) {
      const { projectRef, tableId } = variables
      
      // Invalidate table editor cache to reflect the renamed column
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tableEditorKeys.tableEditor(projectRef, tableId) }),
        queryClient.invalidateQueries({ queryKey: lintKeys.lint(projectRef) }),
      ])
      
      toast.success(`Column renamed successfully`)
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to rename column: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
