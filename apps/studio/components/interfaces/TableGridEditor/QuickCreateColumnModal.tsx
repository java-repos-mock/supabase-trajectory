import { useState } from 'react'
import { toast } from 'sonner'

import { useParams } from 'common'
import { useDatabaseColumnCreateMutation } from 'data/database-columns/database-column-create-mutation'
import { Button, Input, Modal, Select } from 'ui'

export interface QuickCreateColumnModalProps {
  visible: boolean
  tableId: number
  tableName: string
  schema: string
  onClose: () => void
  onSuccess?: () => void
}

const COMMON_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'int4', label: 'Integer' },
  { value: 'int8', label: 'Big Integer' },
  { value: 'float8', label: 'Float' },
  { value: 'bool', label: 'Boolean' },
  { value: 'timestamptz', label: 'Timestamp' },
  { value: 'uuid', label: 'UUID' },
  { value: 'jsonb', label: 'JSONB' },
]

/**
 * Quick modal for creating a new column.
 * 
 * Provides a streamlined interface for adding columns without
 * opening the full column editor side panel.
 */
export function QuickCreateColumnModal({
  visible,
  tableId,
  tableName,
  schema,
  onClose,
  onSuccess,
}: QuickCreateColumnModalProps) {
  const { ref: projectRef } = useParams()
  
  // Form state - initialized once when component mounts
  const [columnName, setColumnName] = useState('')
  const [columnType, setColumnType] = useState('text')
  const [isNullable, setIsNullable] = useState(true)
  const [defaultValue, setDefaultValue] = useState('')

  const { mutate: createColumn, isPending } = useDatabaseColumnCreateMutation({
    onSuccess: () => {
      toast.success(`Column "${columnName}" created successfully`)
      // Reset form on successful creation
      setColumnName('')
      setColumnType('text')
      setIsNullable(true)
      setDefaultValue('')
      onSuccess?.()
      onClose()
    },
    onError: (error) => {
      toast.error(`Failed to create column: ${error.message}`)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!columnName.trim()) {
      toast.error('Column name is required')
      return
    }

    if (!projectRef) {
      toast.error('Project ref not found')
      return
    }

    createColumn({
      projectRef,
      tableId,
      payload: {
        name: columnName.trim(),
        type: columnType,
        isNullable,
        defaultValue: defaultValue || undefined,
      },
    })
  }

  const isValid = columnName.trim().length > 0

  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      header="Quick Create Column"
      size="small"
      customFooter={
        <div className="flex items-center gap-2 justify-end">
          <Button type="default" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="primary"
            onClick={handleSubmit}
            loading={isPending}
            disabled={!isValid || isPending}
          >
            Create Column
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Column Name"
          value={columnName}
          onChange={(e) => setColumnName(e.target.value)}
          placeholder="e.g., created_at"
          autoFocus
        />

        <Select
          label="Type"
          value={columnType}
          onChange={(e) => setColumnType(e.target.value)}
        >
          {COMMON_TYPES.map((type) => (
            <Select.Option key={type.value} value={type.value}>
              {type.label}
            </Select.Option>
          ))}
        </Select>

        <Input
          label="Default Value"
          value={defaultValue}
          onChange={(e) => setDefaultValue(e.target.value)}
          placeholder="Optional"
        />

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="nullable"
            checked={isNullable}
            onChange={(e) => setIsNullable(e.target.checked)}
          />
          <label htmlFor="nullable" className="text-sm">
            Allow NULL values
          </label>
        </div>
      </form>
    </Modal>
  )
}
