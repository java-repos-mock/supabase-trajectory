import { useEffect, useRef, useState, useCallback } from 'react'

export type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export interface UseAutoSaveOptions<T> {
  /** Data to auto-save */
  data: T
  /** Save function */
  onSave: (data: T) => Promise<void>
  /** Delay before auto-saving (ms) */
  delay?: number
  /** Whether auto-save is enabled */
  enabled?: boolean
}

export interface UseAutoSaveResult {
  /** Current save status */
  status: AutoSaveStatus
  /** Last saved timestamp */
  lastSaved: number | null
  /** Manually trigger save */
  saveNow: () => void
  /** Error message if save failed */
  error: string | null
}

/**
 * Hook for auto-saving data with debounce.
 * 
 * Automatically saves data after a delay when it changes.
 * Shows save status for user feedback.
 */
export function useAutoSave<T>(options: UseAutoSaveOptions<T>): UseAutoSaveResult {
  const { data, onSave, delay = 2000, enabled = true } = options

  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  const [lastSaved, setLastSaved] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const previousDataRef = useRef<T>(data)
  const isSavingRef = useRef(false)

  // Save function
  const performSave = useCallback(async (dataToSave: T) => {
    if (isSavingRef.current) return

    isSavingRef.current = true
    setStatus('saving')
    setError(null)

    try {
      await onSave(dataToSave)
      setStatus('saved')
      setLastSaved(Date.now())
      
      // Reset to idle after showing "saved" briefly
      setTimeout(() => {
        setStatus('idle')
      }, 1500)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      isSavingRef.current = false
    }
  }, [onSave])

  // Manual save trigger
  const saveNow = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    performSave(data)
  }, [data, performSave])

  // Watch for data changes and auto-save
  useEffect(() => {
    if (!enabled) return

    // Check if data actually changed (simple reference check)
    if (data === previousDataRef.current) return
    previousDataRef.current = data

    // Clear any pending save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    setStatus('pending')

    // Schedule auto-save
    timeoutRef.current = setTimeout(() => {
      performSave(data)
    }, delay)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [data, delay, enabled, performSave])

  return {
    status,
    lastSaved,
    saveNow,
    error,
  }
}
