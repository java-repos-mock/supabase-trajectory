import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'

import { useParams } from 'common'
import { executeSql } from 'data/sql/execute-sql-query'
import { useQueryClient } from '@tanstack/react-query'
import { tableRowKeys } from 'data/table-rows/keys'

export interface DeletedRowSnapshot {
  tableId: number
  tableName: string
  schema: string
  primaryKeyColumn: string
  rows: Record<string, any>[]
  deletedAt: number
}

const UNDO_TIMEOUT_MS = 30000 // 30 seconds to undo

/**
 * Hook for bulk row deletion with undo capability.
 * 
 * Captures row data before deletion to enable restoration if the user
 * wants to undo the operation. Undo is available for 30 seconds after
 * deletion.
 */
export function useBulkRowDelete() {
  const { ref: projectRef } = useParams()
  const queryClient = useQueryClient()
  
  const [isDeleting, setIsDeleting] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const snapshotRef = useRef<DeletedRowSnapshot | null>(null)
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Clear undo state
  const clearUndoState = useCallback(() => {
    snapshotRef.current = null
    setCanUndo(false)
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current)
      undoTimeoutRef.current = null
    }
  }, [])

  // Delete multiple rows with undo capability
  const deleteRows = useCallback(async (
    tableId: number,
    tableName: string,
    schema: string,
    primaryKeyColumn: string,
    rows: Record<string, any>[]
  ) => {
    if (!projectRef || rows.length === 0) return

    setIsDeleting(true)
    clearUndoState()

    try {
      // Capture row data before deletion to enable undo
      // This snapshot allows us to restore the rows if needed
      snapshotRef.current = {
        tableId,
        tableName,
        schema,
        primaryKeyColumn,
        rows: rows.map(row => ({ ...row })),
        deletedAt: Date.now(),
      }

      // Build DELETE query
      const primaryKeys = rows.map(row => row[primaryKeyColumn])
      const quotedKeys = primaryKeys.map(pk => 
        typeof pk === 'string' ? `'${pk.replace(/'/g, "''")}'` : pk
      )
      
      const deleteSql = `
        DELETE FROM "${schema}"."${tableName}"
        WHERE "${primaryKeyColumn}" IN (${quotedKeys.join(', ')})
      `

      await executeSql({
        projectRef,
        connectionString: undefined,
        sql: deleteSql,
        queryKey: ['bulk-delete', tableId],
      })

      // Invalidate table data cache
      queryClient.invalidateQueries({
        queryKey: tableRowKeys.tableRows(projectRef, tableId),
      })

      setCanUndo(true)
      
      // Set timeout to clear undo capability
      undoTimeoutRef.current = setTimeout(() => {
        clearUndoState()
      }, UNDO_TIMEOUT_MS)

      toast.success(`Deleted ${rows.length} row${rows.length > 1 ? 's' : ''}`, {
        action: {
          label: 'Undo',
          onClick: () => undoDelete(),
        },
        duration: UNDO_TIMEOUT_MS,
      })

    } catch (error) {
      clearUndoState()
      toast.error(`Failed to delete rows: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw error
    } finally {
      setIsDeleting(false)
    }
  }, [projectRef, queryClient, clearUndoState])

  // Undo the last deletion by re-inserting the rows
  const undoDelete = useCallback(async () => {
    const snapshot = snapshotRef.current
    if (!snapshot || !projectRef) {
      toast.error('Nothing to undo')
      return
    }

    setIsDeleting(true)

    try {
      // Build INSERT statements to restore the rows
      const columns = Object.keys(snapshot.rows[0])
      const quotedColumns = columns.map(col => `"${col}"`).join(', ')

      const valueRows = snapshot.rows.map(row => {
        const values = columns.map(col => {
          const val = row[col]
          if (val === null) return 'NULL'
          if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
          if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`
          return val
        })
        return `(${values.join(', ')})`
      })

      const insertSql = `
        INSERT INTO "${snapshot.schema}"."${snapshot.tableName}" (${quotedColumns})
        VALUES ${valueRows.join(',\n')}
      `

      await executeSql({
        projectRef,
        connectionString: undefined,
        sql: insertSql,
        queryKey: ['bulk-undo', snapshot.tableId],
      })

      // Invalidate cache
      queryClient.invalidateQueries({
        queryKey: tableRowKeys.tableRows(projectRef, snapshot.tableId),
      })

      clearUndoState()
      toast.success(`Restored ${snapshot.rows.length} row${snapshot.rows.length > 1 ? 's' : ''}`)

    } catch (error) {
      toast.error(`Failed to restore rows: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw error
    } finally {
      setIsDeleting(false)
    }
  }, [projectRef, queryClient, clearUndoState])

  return {
    deleteRows,
    undoDelete,
    isDeleting,
    canUndo,
    clearUndoState,
  }
}
