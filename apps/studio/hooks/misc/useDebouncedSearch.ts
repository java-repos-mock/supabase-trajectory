import { useState, useEffect, useRef, useCallback } from 'react'

export interface UseDebouncedSearchOptions {
  /** Debounce delay in milliseconds */
  delay?: number
  /** Minimum characters before triggering search */
  minChars?: number
  /** Called when search is triggered */
  onSearch: (query: string) => void | Promise<void>
}

export interface UseDebouncedSearchResult {
  /** Current input value */
  value: string
  /** Update the input value */
  setValue: (value: string) => void
  /** Whether a search is pending */
  isPending: boolean
  /** Clear the search input */
  clear: () => void
}

/**
 * Hook for debounced search input handling.
 * 
 * Debounces user input and triggers search callback after delay.
 * Useful for search boxes that query an API.
 */
export function useDebouncedSearch(
  options: UseDebouncedSearchOptions
): UseDebouncedSearchResult {
  const { delay = 300, minChars = 1, onSearch } = options

  const [value, setValue] = useState('')
  const [isPending, setIsPending] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Handle value changes with debouncing
  const handleChange = useCallback((newValue: string) => {
    setValue(newValue)

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Don't search if below minimum characters
    if (newValue.length < minChars) {
      setIsPending(false)
      return
    }

    setIsPending(true)

    // Set up debounced search
    timeoutRef.current = setTimeout(async () => {
      try {
        await onSearch(newValue)
      } finally {
        setIsPending(false)
      }
    }, delay)
  }, [delay, minChars, onSearch])

  // Clear function
  const clear = useCallback(() => {
    setValue('')
    setIsPending(false)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  // Handle external changes to onSearch callback
  // This ensures we use the latest callback without restarting debounce
  useEffect(() => {
    const currentTimeout = timeoutRef.current
    
    // If there's a pending search and callback changed, reschedule with new callback
    if (currentTimeout && isPending) {
      clearTimeout(currentTimeout)
      timeoutRef.current = setTimeout(async () => {
        try {
          await onSearch(value)
        } finally {
          setIsPending(false)
        }
      }, delay)
    }
  }, [onSearch])

  return {
    value,
    setValue: handleChange,
    isPending,
    clear,
  }
}
