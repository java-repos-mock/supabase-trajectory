import { useState, useCallback, useRef, useEffect } from 'react'
import { useDebouncedCallback } from 'use-debounce'

export interface UseInlineEditOptions<T> {
  /** Initial value */
  initialValue: T
  /** Save function - called with debounced value */
  onSave: (value: T) => Promise<{ value: T }>
  /** Debounce delay in milliseconds */
  debounceMs?: number
  /** Called when save succeeds */
  onSaveSuccess?: (savedValue: T) => void
  /** Called when save fails */
  onSaveError?: (error: Error) => void
}

export interface UseInlineEditResult<T> {
  /** Current value */
  value: T
  /** Update the value (triggers debounced save) */
  setValue: (value: T) => void
  /** Whether a save is in progress */
  isSaving: boolean
  /** Whether there are unsaved changes */
  isDirty: boolean
  /** Last error from save attempt */
  error: Error | null
}

/**
 * Hook for inline editing with auto-save.
 * 
 * Provides debounced saving to reduce API calls while typing.
 * Syncs local state with server response to maintain consistency
 * across multiple tabs or concurrent edits.
 */
export function useInlineEdit<T>(options: UseInlineEditOptions<T>): UseInlineEditResult<T> {
  const { 
    initialValue, 
    onSave, 
    debounceMs = 1000,
    onSaveSuccess,
    onSaveError,
  } = options

  const [value, setValueState] = useState<T>(initialValue)
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Track the last saved value for dirty checking
  const lastSavedValueRef = useRef<T>(initialValue)

  // Sync with initialValue changes (e.g., when switching items)
  useEffect(() => {
    setValueState(initialValue)
    lastSavedValueRef.current = initialValue
    setIsDirty(false)
  }, [initialValue])

  // Debounced save function
  const debouncedSave = useDebouncedCallback(
    async (valueToSave: T) => {
      setIsSaving(true)
      setError(null)

      try {
        const response = await onSave(valueToSave)
        
        // Sync local state with server response to ensure consistency
        // This handles cases where the server normalizes or transforms the value,
        // and keeps the UI in sync when multiple tabs edit the same item
        setValueState(response.value)
        lastSavedValueRef.current = response.value
        setIsDirty(false)
        
        onSaveSuccess?.(response.value)
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Save failed')
        setError(error)
        onSaveError?.(error)
      } finally {
        setIsSaving(false)
      }
    },
    debounceMs
  )

  // Handle value changes
  const setValue = useCallback((newValue: T) => {
    setValueState(newValue)
    setIsDirty(true)
    debouncedSave(newValue)
  }, [debouncedSave])

  return {
    value,
    setValue,
    isSaving,
    isDirty,
    error,
  }
}
