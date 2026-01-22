import { useEffect, useRef, useCallback, useState } from 'react'
import { useProjectContext } from 'components/layouts/ProjectLayout/ProjectContext'
import {
  RealtimeSubscriptionManager,
  SubscriptionConfig,
  SubscriptionState,
  RealtimeEvent,
  createTableChannelName,
  deduplicateEvents,
  sortEventsByTimestamp,
} from 'lib/realtime-manager'
import type { RealtimeClient } from '@supabase/supabase-js'

export interface UseRealtimeSubscriptionOptions<T = unknown> {
  table: string
  schema?: string
  filter?: string
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  enabled?: boolean
  onEvent?: (event: RealtimeEvent<T>) => void
  onStatusChange?: (status: SubscriptionState['status']) => void
  bufferEvents?: boolean
  bufferTimeout?: number
}

export interface UseRealtimeSubscriptionReturn<T = unknown> {
  status: SubscriptionState['status']
  isConnected: boolean
  error: Error | null
  events: RealtimeEvent<T>[]
  reconnect: () => Promise<void>
  clearEvents: () => void
}

let globalManager: RealtimeSubscriptionManager | null = null

function getManager(client: RealtimeClient): RealtimeSubscriptionManager {
  if (!globalManager) {
    globalManager = new RealtimeSubscriptionManager(client)
  }
  return globalManager
}

/**
 * Hook for subscribing to realtime database changes.
 */
export function useRealtimeSubscription<T = unknown>(
  options: UseRealtimeSubscriptionOptions<T>
): UseRealtimeSubscriptionReturn<T> {
  const {
    table,
    schema = 'public',
    filter,
    event = '*',
    enabled = true,
    onEvent,
    onStatusChange,
    bufferEvents = false,
    bufferTimeout = 100,
  } = options

  const { project } = useProjectContext()
  const [status, setStatus] = useState<SubscriptionState['status']>('disconnected')
  const [error, setError] = useState<Error | null>(null)
  const [events, setEvents] = useState<RealtimeEvent<T>[]>([])

  const eventBufferRef = useRef<RealtimeEvent<T>[]>([])
  const bufferTimerRef = useRef<NodeJS.Timeout | null>(null)
  const seenEventsRef = useRef<Set<string>>(new Set())
  const managerRef = useRef<RealtimeSubscriptionManager | null>(null)

  const channelName = createTableChannelName(table, schema)

  const flushEventBuffer = useCallback(() => {
    if (eventBufferRef.current.length === 0) return

    const deduplicated = deduplicateEvents(
      eventBufferRef.current,
      seenEventsRef.current
    )
    const sorted = sortEventsByTimestamp(deduplicated)

    setEvents((prev) => [...prev, ...sorted])
    eventBufferRef.current = []
  }, [])

  const handleEvent = useCallback(
    (realtimeEvent: RealtimeEvent<T>) => {
      if (bufferEvents) {
        eventBufferRef.current.push(realtimeEvent)

        if (bufferTimerRef.current) {
          clearTimeout(bufferTimerRef.current)
        }

        bufferTimerRef.current = setTimeout(flushEventBuffer, bufferTimeout)
      } else {
        const deduplicated = deduplicateEvents(
          [realtimeEvent],
          seenEventsRef.current
        )
        if (deduplicated.length > 0) {
          setEvents((prev) => [...prev, ...deduplicated])
        }
      }

      onEvent?.(realtimeEvent)
    },
    [bufferEvents, bufferTimeout, flushEventBuffer, onEvent]
  )

  const handleStatusChange = useCallback(
    (newStatus: SubscriptionState['status']) => {
      setStatus(newStatus)

      if (newStatus === 'error') {
        const state = managerRef.current?.getState(channelName)
        setError(state?.error || new Error('Unknown error'))
      } else {
        setError(null)
      }

      onStatusChange?.(newStatus)
    },
    [channelName, onStatusChange]
  )

  const reconnect = useCallback(async () => {
    if (managerRef.current) {
      await managerRef.current.reconnect(channelName)
    }
  }, [channelName])

  const clearEvents = useCallback(() => {
    setEvents([])
    seenEventsRef.current.clear()
    eventBufferRef.current = []
  }, [])

  useEffect(() => {
    if (!enabled || !project?.ref) return

    const client = project.realtimeClient as RealtimeClient
    if (!client) return

    const manager = getManager(client)
    managerRef.current = manager

    const config: SubscriptionConfig = {
      channelName,
      table,
      schema,
      filter,
      event,
    }

    const unsubscribeEvent = manager.subscribe<T>(config, handleEvent)
    const unsubscribeStatus = manager.onStatusChange(channelName, handleStatusChange)

    return () => {
      unsubscribeEvent()
      unsubscribeStatus()

      if (bufferTimerRef.current) {
        clearTimeout(bufferTimerRef.current)
      }
    }
  }, [
    enabled,
    project?.ref,
    channelName,
    table,
    schema,
    filter,
    event,
    handleEvent,
    handleStatusChange,
  ])

  return {
    status,
    isConnected: status === 'connected',
    error,
    events,
    reconnect,
    clearEvents,
  }
}

/**
 * Hook for subscribing to multiple tables.
 */
export function useRealtimeMultiSubscription<T = unknown>(
  tables: UseRealtimeSubscriptionOptions<T>[],
  options: {
    enabled?: boolean
    onAnyEvent?: (table: string, event: RealtimeEvent<T>) => void
  } = {}
): Map<string, UseRealtimeSubscriptionReturn<T>> {
  const { enabled = true, onAnyEvent } = options
  const { project } = useProjectContext()
  const [subscriptions, setSubscriptions] = useState<
    Map<string, UseRealtimeSubscriptionReturn<T>>
  >(new Map())

  const managerRef = useRef<RealtimeSubscriptionManager | null>(null)

  useEffect(() => {
    if (!enabled || !project?.ref) return

    const client = project.realtimeClient as RealtimeClient
    if (!client) return

    const manager = getManager(client)
    managerRef.current = manager

    const unsubscribers: (() => void)[] = []
    const newSubscriptions = new Map<string, UseRealtimeSubscriptionReturn<T>>()

    for (const tableConfig of tables) {
      const { table, schema = 'public', filter, event = '*' } = tableConfig
      const channelName = createTableChannelName(table, schema)

      const subscriptionState: UseRealtimeSubscriptionReturn<T> = {
        status: 'connecting',
        isConnected: false,
        error: null,
        events: [],
        reconnect: async () => {
          await manager.reconnect(channelName)
        },
        clearEvents: () => {},
      }

      newSubscriptions.set(table, subscriptionState)

      const config: SubscriptionConfig = {
        channelName,
        table,
        schema,
        filter,
        event,
      }

      const unsubscribeEvent = manager.subscribe<T>(config, (evt) => {
        onAnyEvent?.(table, evt)
      })

      unsubscribers.push(unsubscribeEvent)
    }

    setSubscriptions(newSubscriptions)

    return () => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [enabled, project?.ref, tables, onAnyEvent])

  return subscriptions
}

/**
 * Hook for presence tracking.
 */
export function useRealtimePresence(
  channelName: string,
  userState: Record<string, unknown>,
  options: { enabled?: boolean } = {}
): {
  presenceState: Map<string, Record<string, unknown>>
  isConnected: boolean
} {
  const { enabled = true } = options
  const { project } = useProjectContext()
  const [presenceState, setPresenceState] = useState<
    Map<string, Record<string, unknown>>
  >(new Map())
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!enabled || !project?.ref) return

    const client = project.realtimeClient as RealtimeClient
    if (!client) return

    const channel = client.channel(channelName)

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const newPresenceState = new Map<string, Record<string, unknown>>()

        Object.entries(state).forEach(([key, presences]) => {
          if (Array.isArray(presences) && presences.length > 0) {
            newPresenceState.set(key, presences[0] as Record<string, unknown>)
          }
        })

        setPresenceState(newPresenceState)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true)
          await channel.track(userState)
        }
      })

    return () => {
      channel.unsubscribe()
    }
  }, [enabled, project?.ref, channelName, userState])

  return { presenceState, isConnected }
}
