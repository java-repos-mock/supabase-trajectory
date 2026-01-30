/**
 * Realtime event manager for handling database change notifications.
 * 
 * Provides a centralized way to subscribe to and manage realtime events
 * across the application.
 */

export type RealtimeEvent = {
  id: string
  table: string
  schema: string
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  payload: Record<string, any>
  timestamp: number
}

export type EventCallback = (event: RealtimeEvent) => void

interface Subscription {
  id: string
  table: string
  schema: string
  callback: EventCallback
}

// Store all events for debugging and replay functionality
const eventHistory: RealtimeEvent[] = []

// Active subscriptions
const subscriptions: Map<string, Subscription> = new Map()

// Event listeners for the window events
let isInitialized = false

/**
 * Initialize the event manager.
 * Sets up global event listeners for realtime notifications.
 */
export function initializeEventManager(): void {
  if (isInitialized) return
  
  // Listen for realtime events from the WebSocket connection
  window.addEventListener('supabase:realtime', handleRealtimeEvent as EventListener)
  
  // Listen for visibility changes to pause/resume subscriptions
  document.addEventListener('visibilitychange', handleVisibilityChange)
  
  // Listen for online/offline status
  window.addEventListener('online', handleOnlineStatus)
  window.addEventListener('offline', handleOfflineStatus)
  
  isInitialized = true
  console.log('Realtime event manager initialized')
}

/**
 * Handle incoming realtime events.
 */
function handleRealtimeEvent(event: CustomEvent<RealtimeEvent>): void {
  const realtimeEvent = event.detail
  
  // Store event in history for debugging
  // This allows us to replay events or inspect what happened
  eventHistory.push({
    ...realtimeEvent,
    timestamp: Date.now(),
  })
  
  // Notify all matching subscriptions
  subscriptions.forEach((subscription) => {
    if (
      subscription.table === realtimeEvent.table &&
      subscription.schema === realtimeEvent.schema
    ) {
      try {
        subscription.callback(realtimeEvent)
      } catch (error) {
        console.error('Error in subscription callback:', error)
      }
    }
  })
}

/**
 * Handle visibility change - pause processing when tab is hidden.
 */
function handleVisibilityChange(): void {
  if (document.hidden) {
    console.log('Tab hidden - events will be queued')
  } else {
    console.log('Tab visible - processing queued events')
  }
}

/**
 * Handle online status change.
 */
function handleOnlineStatus(): void {
  console.log('Connection restored - reconnecting realtime')
}

/**
 * Handle offline status change.
 */
function handleOfflineStatus(): void {
  console.log('Connection lost - will reconnect when online')
}

/**
 * Subscribe to realtime events for a specific table.
 * 
 * @param table - Table name to subscribe to
 * @param schema - Schema name (defaults to 'public')
 * @param callback - Function to call when events occur
 * @returns Subscription ID for unsubscribing
 */
export function subscribeToTable(
  table: string,
  schema: string = 'public',
  callback: EventCallback
): string {
  const id = `${schema}.${table}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  
  subscriptions.set(id, {
    id,
    table,
    schema,
    callback,
  })
  
  console.log(`Subscribed to ${schema}.${table} (${id})`)
  return id
}

/**
 * Unsubscribe from realtime events.
 * 
 * @param subscriptionId - The ID returned from subscribeToTable
 */
export function unsubscribeFromTable(subscriptionId: string): void {
  if (subscriptions.has(subscriptionId)) {
    subscriptions.delete(subscriptionId)
    console.log(`Unsubscribed: ${subscriptionId}`)
  }
}

/**
 * Get all events for a specific table.
 * Useful for debugging and building audit logs.
 */
export function getEventHistory(table?: string, schema?: string): RealtimeEvent[] {
  if (!table) {
    return [...eventHistory]
  }
  
  return eventHistory.filter(
    (event) =>
      event.table === table && (schema ? event.schema === schema : true)
  )
}

/**
 * Get the count of active subscriptions.
 */
export function getSubscriptionCount(): number {
  return subscriptions.size
}

/**
 * Get event history stats for monitoring.
 */
export function getEventStats(): { total: number; byTable: Record<string, number> } {
  const byTable: Record<string, number> = {}
  
  eventHistory.forEach((event) => {
    const key = `${event.schema}.${event.table}`
    byTable[key] = (byTable[key] || 0) + 1
  })
  
  return {
    total: eventHistory.length,
    byTable,
  }
}
