/**
 * Hook for managing database column operations
 * 
 * Provides a unified interface for column CRUD operations with
 * optimistic updates and proper error handling.
 */

import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { useColumnCommentMutation } from 'data/database-columns/database-column-comment-mutation'
import { useColumnRenameMutation } from 'data/database-columns/database-column-rename-mutation'
import { useDatabaseColumnUpdateMutation } from 'data/database-columns/database-column-update-mutation'
import { validateColumnName, validateDefaultValue } from 'lib/database-column-utils'

export interface ColumnInfo {
  name: string
  schema: string
  table: string
  tableId: number
  dataType: string
  isNullable: boolean
  defaultValue?: string
  comment?: string
}

export interface UseColumnManagementOptions {
  projectRef: string
  connectionString?: string | null
  onSuccess?: () => void
  onError?: (error: Error) => void
}

export interface UseColumnManagementReturn {
  isLoading: boolean
  error: Error | null
  updateComment: (column: ColumnInfo, comment: string | null) => Promise<void>
  renameColumn: (column: ColumnInfo, newName: string) => Promise<void>
  updateColumn: (column: ColumnInfo, changes: Partial<ColumnInfo>) => Promise<void>
  validateChanges: (column: ColumnInfo, changes: Partial<ColumnInfo>) => { valid: boolean; errors: string[] }
}

export function useColumnManagement({
  projectRef,
  connectionString,
  onSuccess,
  onError,
}: UseColumnManagementOptions): UseColumnManagementReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const commentMutation = useColumnCommentMutation({
    onSuccess: () => {
      onSuccess?.()
    },
    onError: (err) => {
      setError(new Error(err.message))
      onError?.(new Error(err.message))
    },
  })

  const renameMutation = useColumnRenameMutation({
    onSuccess: () => {
      onSuccess?.()
    },
    onError: (err) => {
      setError(new Error(err.message))
      onError?.(new Error(err.message))
    },
  })

  const updateMutation = useDatabaseColumnUpdateMutation({
    onSuccess: () => {
      onSuccess?.()
    },
    onError: (err) => {
      setError(new Error(err.message))
      onError?.(new Error(err.message))
    },
  })

  const updateComment = useCallback(
    async (column: ColumnInfo, comment: string | null) => {
      setIsLoading(true)
      setError(null)
      
      try {
        await commentMutation.mutateAsync({
          projectRef,
          connectionString,
          schema: column.schema,
          table: column.table,
          column: column.name,
          comment,
        })
      } finally {
        setIsLoading(false)
      }
    },
    [projectRef, connectionString, commentMutation]
  )

  const renameColumn = useCallback(
    async (column: ColumnInfo, newName: string) => {
      setIsLoading(true)
      setError(null)

      // Validate the new name first
      const validation = validateColumnName(newName)
      if (!validation.valid) {
        const err = new Error(validation.error)
        setError(err)
        onError?.(err)
        setIsLoading(false)
        return
      }

      try {
        await renameMutation.mutateAsync({
          projectRef,
          connectionString,
          schema: column.schema,
          table: column.table,
          tableId: column.tableId,
          oldName: column.name,
          newName,
        })
      } finally {
        setIsLoading(false)
      }
    },
    [projectRef, connectionString, renameMutation, onError]
  )

  const updateColumn = useCallback(
    async (column: ColumnInfo, changes: Partial<ColumnInfo>) => {
      setIsLoading(true)
      setError(null)

      try {
        // Handle rename separately if name changed
        if (changes.name && changes.name !== column.name) {
          await renameColumn(column, changes.name)
          // Update column reference for subsequent operations
          column = { ...column, name: changes.name }
        }

        // Handle comment update separately
        if ('comment' in changes && changes.comment !== column.comment) {
          await updateComment(column, changes.comment ?? null)
        }

        // Handle other column properties via the update mutation
        const hasOtherChanges = 
          changes.dataType !== undefined ||
          changes.isNullable !== undefined ||
          changes.defaultValue !== undefined

        if (hasOtherChanges) {
          await updateMutation.mutateAsync({
            projectRef,
            connectionString,
            originalColumn: {
              id: column.tableId, // Using tableId as column id placeholder
              name: column.name,
              schema: column.schema,
              table: column.table,
              table_id: column.tableId,
              ordinal_position: 0,
              is_identity: false,
              is_unique: false,
            },
            payload: {
              type: changes.dataType,
              isNullable: changes.isNullable,
              defaultValue: changes.defaultValue,
            },
          })
        }
      } finally {
        setIsLoading(false)
      }
    },
    [projectRef, connectionString, renameColumn, updateComment, updateMutation]
  )

  const validateChanges = useCallback(
    (column: ColumnInfo, changes: Partial<ColumnInfo>): { valid: boolean; errors: string[] } => {
      const errors: string[] = []

      // Validate name change
      if (changes.name) {
        const nameValidation = validateColumnName(changes.name)
        if (!nameValidation.valid) {
          errors.push(nameValidation.error!)
        }
      }

      // Validate default value
      if (changes.defaultValue) {
        const defaultValidation = validateDefaultValue(
          changes.dataType || column.dataType,
          changes.defaultValue
        )
        if (!defaultValidation.valid) {
          errors.push(defaultValidation.error!)
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      }
    },
    []
  )

  return {
    isLoading: isLoading || commentMutation.isPending || renameMutation.isPending || updateMutation.isPending,
    error,
    updateComment,
    renameColumn,
    updateColumn,
    validateChanges,
  }
}

export default useColumnManagement
