import { useState } from 'react'
import { AlertTriangle, Trash2, Undo2 } from 'lucide-react'

import { useBulkRowDelete } from 'hooks/misc/useBulkRowDelete'
import {
  Button,
  Modal,
  Alert,
  Checkbox,
} from 'ui'

export interface BulkDeleteConfirmModalProps {
  visible: boolean
  tableId: number
  tableName: string
  schema: string
  primaryKeyColumn: string
  selectedRows: Record<string, any>[]
  onClose: () => void
  onDeleted?: () => void
}

/**
 * Confirmation modal for bulk row deletion.
 * 
 * Shows a warning about the number of rows to be deleted and
 * provides an undo option after deletion completes.
 */
export function BulkDeleteConfirmModal({
  visible,
  tableId,
  tableName,
  schema,
  primaryKeyColumn,
  selectedRows,
  onClose,
  onDeleted,
}: BulkDeleteConfirmModalProps) {
  const [confirmed, setConfirmed] = useState(false)
  const { deleteRows, isDeleting } = useBulkRowDelete()

  const rowCount = selectedRows.length

  const handleDelete = async () => {
    try {
      await deleteRows(tableId, tableName, schema, primaryKeyColumn, selectedRows)
      onDeleted?.()
      onClose()
    } catch {
      // Error handled in hook
    }
  }

  const handleClose = () => {
    setConfirmed(false)
    onClose()
  }

  return (
    <Modal
      visible={visible}
      onCancel={handleClose}
      header={
        <div className="flex items-center gap-2 text-destructive">
          <Trash2 size={18} />
          <span>Delete {rowCount} Row{rowCount > 1 ? 's' : ''}</span>
        </div>
      }
      size="small"
      customFooter={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-foreground-light text-xs">
            <Undo2 size={12} />
            <span>You can undo this for 30 seconds</span>
          </div>
          <div className="flex items-center gap-2">
            <Button type="default" onClick={handleClose} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              type="danger"
              onClick={handleDelete}
              loading={isDeleting}
              disabled={!confirmed || isDeleting}
            >
              Delete {rowCount} Row{rowCount > 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 py-4">
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <div>
            <p className="font-medium">This action cannot be fully undone</p>
            <p className="text-sm text-foreground-light mt-1">
              While the deleted rows can be restored, any data in related tables 
              that was automatically removed may not be recoverable.
            </p>
          </div>
        </Alert>

        <div className="rounded border border-default bg-surface-100 p-3">
          <p className="text-sm">
            You are about to delete <strong>{rowCount}</strong> row{rowCount > 1 ? 's' : ''} from{' '}
            <code className="text-xs bg-surface-200 px-1 py-0.5 rounded">
              {schema}.{tableName}
            </code>
          </p>
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="confirm-delete"
            checked={confirmed}
            onCheckedChange={(checked) => setConfirmed(checked as boolean)}
          />
          <label htmlFor="confirm-delete" className="text-sm cursor-pointer">
            I understand that this will permanently delete the selected rows
          </label>
        </div>
      </div>
    </Modal>
  )
}
