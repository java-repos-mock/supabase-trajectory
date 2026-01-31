import { useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { useParams } from 'common'
import { databaseColumnKeys } from 'data/database-columns/keys'
import { useDatabaseColumnUpdateMutation } from 'data/database-columns/database-column-update-mutation'

interface ColumnData {
  id: string
  name: string
  comment: string | null
  schema: string
  table: string
  table_id: number
  ordinal_position: number
  is_identity: boolean
  is_unique: boolean
}

/**
 * Hook for optimistic column updates.
 * 
 * Provides instant UI feedback while updates are being persisted.
 * Captures the current state before mutation to enable rollback
 * on error, ensuring consistent UI state.
 */
export function useOptimisticColumnUpdate() {
  const { ref: projectRef } = useParams()
  const queryClient = useQueryClient()
  
  // Store the state at the time of mutation for rollback
  const previousStateRef = useRef<ColumnData | null>(null)

  const { mutateAsync: updateColumn, isPending } = useDatabaseColumnUpdateMutation()

  const updateColumnComment = useCallback(async (
    column: ColumnData,
    newComment: string
  ) => {
    if (!projectRef) throw new Error('Project ref required')

    const queryKey = databaseColumnKeys.list(projectRef, column.table_id)

    // Capture current state for potential rollback
    previousStateRef.current = { ...column }

    // Optimistically update the cache immediately for instant feedback
    queryClient.setQueryData<ColumnData[]>(queryKey, (oldData) => {
      if (!oldData) return oldData
      return oldData.map((col) =>
        col.id === column.id ? { ...col, comment: newComment } : col
      )
    })

    try {
      await updateColumn({
        projectRef,
        originalColumn: {
          id: column.id,
          name: column.name,
          schema: column.schema,
          table: column.table,
          table_id: column.table_id,
          ordinal_position: column.ordinal_position,
          is_identity: column.is_identity,
          is_unique: column.is_unique,
        },
        payload: {
          comment: newComment,
        },
      })

      // Update successful - clear the previous state
      previousStateRef.current = null
    } catch (error) {
      // Rollback to the captured state on error
      if (previousStateRef.current) {
        queryClient.setQueryData<ColumnData[]>(queryKey, (oldData) => {
          if (!oldData) return oldData
          return oldData.map((col) =>
            col.id === previousStateRef.current!.id
              ? previousStateRef.current!
              : col
          )
        })
        previousStateRef.current = null
      }
      throw error
    }
  }, [projectRef, queryClient, updateColumn])

  const updateColumnName = useCallback(async (
    column: ColumnData,
    newName: string
  ) => {
    if (!projectRef) throw new Error('Project ref required')

    const queryKey = databaseColumnKeys.list(projectRef, column.table_id)

    // Capture current state for rollback
    previousStateRef.current = { ...column }

    // Optimistic update
    queryClient.setQueryData<ColumnData[]>(queryKey, (oldData) => {
      if (!oldData) return oldData
      return oldData.map((col) =>
        col.id === column.id ? { ...col, name: newName } : col
      )
    })

    try {
      await updateColumn({
        projectRef,
        originalColumn: {
          id: column.id,
          name: column.name,
          schema: column.schema,
          table: column.table,
          table_id: column.table_id,
          ordinal_position: column.ordinal_position,
          is_identity: column.is_identity,
          is_unique: column.is_unique,
        },
        payload: {
          name: newName,
        },
      })

      previousStateRef.current = null
    } catch (error) {
      // Rollback
      if (previousStateRef.current) {
        queryClient.setQueryData<ColumnData[]>(queryKey, (oldData) => {
          if (!oldData) return oldData
          return oldData.map((col) =>
            col.id === previousStateRef.current!.id
              ? previousStateRef.current!
              : col
          )
        })
        previousStateRef.current = null
      }
      throw error
    }
  }, [projectRef, queryClient, updateColumn])

  return {
    updateColumnComment,
    updateColumnName,
    isPending,
  }
}
