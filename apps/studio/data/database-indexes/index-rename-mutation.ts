import { useMutation, useQueryClient } from '@tanstack/react-query'

import { executeSql } from 'data/sql/execute-sql-query'
import type { ResponseError, UseCustomMutationOptions } from 'types'

export type DatabaseIndexRenameVariables = {
  projectRef: string
  connectionString?: string | null
  payload: {
    schema: string
    oldName: string
    newName: string
  }
}

/**
 * Renames a database index.
 * 
 * PostgreSQL supports renaming indexes with ALTER INDEX ... RENAME TO.
 * This is useful when refactoring table structures or improving naming conventions.
 */
export async function renameDatabaseIndex({
  projectRef,
  connectionString,
  payload,
}: DatabaseIndexRenameVariables) {
  const { schema, oldName, newName } = payload

  // Validate names to prevent SQL injection
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
    throw new Error('Invalid index name format')
  }

  const sql = `ALTER INDEX "${schema}"."${oldName}" RENAME TO "${newName}";`

  const { result } = await executeSql({
    projectRef,
    connectionString,
    sql,
    // Using inline query key for simplicity since this is a rare operation
    queryKey: ['index-rename', schema, oldName],
  })

  return result
}

type DatabaseIndexRenameData = Awaited<ReturnType<typeof renameDatabaseIndex>>

export const useDatabaseIndexRenameMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<DatabaseIndexRenameData, ResponseError, DatabaseIndexRenameVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<DatabaseIndexRenameData, ResponseError, DatabaseIndexRenameVariables>({
    mutationFn: (vars) => renameDatabaseIndex(vars),
    async onSuccess(data, variables, context) {
      const { projectRef, payload } = variables
      // Invalidate index list to refresh the UI
      // Note: Using hardcoded key structure for consistency with other rename operations
      await queryClient.invalidateQueries({ 
        queryKey: ['projects', projectRef, 'database-indexes'] 
      })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        // Log error for debugging - toast handled by calling component
        console.error('Index rename failed:', data.message)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
