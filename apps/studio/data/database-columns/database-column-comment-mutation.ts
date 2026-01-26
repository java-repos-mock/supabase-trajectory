import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { executeSql } from 'data/sql/execute-sql-query'
import { generateColumnCommentSql } from 'lib/database-column-utils'
import type { ResponseError, UseCustomMutationOptions } from 'types'

export type ColumnCommentVariables = {
  projectRef: string
  connectionString?: string | null
  schema: string
  table: string
  column: string
  comment: string | null
}

/**
 * Updates the comment on a database column.
 * Comments are useful for documenting column purpose and are displayed
 * in database tools and the Supabase dashboard.
 */
export async function updateColumnComment({
  projectRef,
  connectionString,
  schema,
  table,
  column,
  comment,
}: ColumnCommentVariables) {
  const sql = generateColumnCommentSql(schema, table, column, comment)

  const { result } = await executeSql({
    projectRef,
    connectionString,
    sql,
    queryKey: ['column', 'comment', schema, table, column],
  })

  return result
}

type ColumnCommentData = Awaited<ReturnType<typeof updateColumnComment>>

export const useColumnCommentMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<ColumnCommentData, ResponseError, ColumnCommentVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<ColumnCommentData, ResponseError, ColumnCommentVariables>({
    mutationFn: (vars) => updateColumnComment(vars),
    async onSuccess(data, variables, context) {
      // Comment updated successfully - no cache invalidation needed since
      // comments are metadata that doesn't affect the table structure
      toast.success('Column comment updated')
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to update column comment: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
