import { useState, useCallback } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'

import { useParams } from 'common'
import { useTableUpdateMutation } from 'data/tables/table-update-mutation'
import { useInlineEdit } from 'hooks/misc/useInlineEdit'
import { Button, Input } from 'ui'

export interface InlineDescriptionEditorProps {
  tableId: number
  tableName: string
  schema: string
  description: string | null
  onDescriptionChange?: (description: string) => void
}

/**
 * Inline editor for table descriptions.
 * 
 * Provides auto-save with debounce for seamless editing experience.
 * Changes are persisted to the database automatically as you type.
 */
export function InlineDescriptionEditor({
  tableId,
  tableName,
  schema,
  description,
  onDescriptionChange,
}: InlineDescriptionEditorProps) {
  const { ref: projectRef } = useParams()
  const [isEditing, setIsEditing] = useState(false)

  const { mutateAsync: updateTable } = useTableUpdateMutation()

  const handleSave = useCallback(async (newDescription: string) => {
    if (!projectRef) throw new Error('Project ref required')

    await updateTable({
      projectRef,
      id: tableId,
      name: tableName,
      schema,
      payload: { comment: newDescription || null },
    })

    return { value: newDescription }
  }, [projectRef, tableId, tableName, schema, updateTable])

  const {
    value: editedDescription,
    setValue: setEditedDescription,
    isSaving,
    isDirty,
    error,
  } = useInlineEdit({
    initialValue: description || '',
    onSave: handleSave,
    debounceMs: 800,
    onSaveSuccess: (savedValue) => {
      toast.success('Description updated')
      onDescriptionChange?.(savedValue)
    },
    onSaveError: (err) => {
      toast.error(`Failed to save description: ${err.message}`)
    },
  })

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2 group">
        <span className="text-foreground-light text-sm">
          {description || 'No description'}
        </span>
        <Button
          type="text"
          size="tiny"
          icon={<Pencil size={12} />}
          onClick={() => setIsEditing(true)}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Edit
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        size="tiny"
        value={editedDescription}
        onChange={(e) => setEditedDescription(e.target.value)}
        placeholder="Enter table description..."
        className="w-64"
        autoFocus
      />
      <div className="flex items-center gap-1">
        {isSaving && (
          <span className="text-foreground-light text-xs">Saving...</span>
        )}
        {isDirty && !isSaving && (
          <span className="text-foreground-light text-xs">Unsaved</span>
        )}
        {!isDirty && !isSaving && (
          <span className="text-brand text-xs">Saved</span>
        )}
      </div>
      <Button
        type="text"
        size="tiny"
        icon={<X size={12} />}
        onClick={() => setIsEditing(false)}
      >
        Done
      </Button>
    </div>
  )
}
