import { useEffect, useRef, useState, useCallback } from 'react'
import { RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js'

import { useParams } from 'common'
import { useSupabaseClient } from 'hooks/misc/useSupabaseClient'

export interface PresenceUser {
  id: string
  email?: string
  name?: string
  lastSeen: number
}

export interface UseRealtimePresenceOptions {
  /** Room/channel name for presence */
  room: string
  /** Current user info */
  user: PresenceUser
  /** Called when presence state changes */
  onPresenceChange?: (users: PresenceUser[]) => void
  /** Enable/disable presence tracking */
  enabled?: boolean
}

/**
 * Hook for managing realtime presence in a room.
 * 
 * Tracks which users are currently viewing a resource and
 * handles reconnection gracefully when connection drops.
 */
export function useRealtimePresence(options: UseRealtimePresenceOptions) {
  const { room, user, onPresenceChange, enabled = true } = options
  const { ref: projectRef } = useParams()
  const supabase = useSupabaseClient()
  
  const [users, setUsers] = useState<PresenceUser[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Sync presence state to users array
  const syncPresence = useCallback((state: RealtimePresenceState<PresenceUser>) => {
    const presenceUsers: PresenceUser[] = []
    
    for (const [, presences] of Object.entries(state)) {
      for (const presence of presences) {
        presenceUsers.push(presence as unknown as PresenceUser)
      }
    }

    setUsers(presenceUsers)
    onPresenceChange?.(presenceUsers)
  }, [onPresenceChange])

  // Handle reconnection when connection drops
  const scheduleReconnect = useCallback(() => {
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    // Schedule reconnection after delay to avoid rapid reconnects
    reconnectTimeoutRef.current = setTimeout(() => {
      if (!channelRef.current || channelRef.current.state === 'closed') {
        // Create new channel for reconnection
        const channelName = `presence:${projectRef}:${room}`
        const channel = supabase.channel(channelName)
        
        channel
          .on('presence', { event: 'sync' }, () => {
            syncPresence(channel.presenceState())
          })
          .on('presence', { event: 'join' }, ({ newPresences }) => {
            setUsers(prev => [...prev, ...(newPresences as PresenceUser[])])
          })
          .on('presence', { event: 'leave' }, ({ leftPresences }) => {
            const leftIds = new Set((leftPresences as PresenceUser[]).map(p => p.id))
            setUsers(prev => prev.filter(u => !leftIds.has(u.id)))
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              setIsConnected(true)
              await channel.track(user)
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
              setIsConnected(false)
              scheduleReconnect()
            }
          })

        channelRef.current = channel
      }
    }, 3000) // 3 second delay before reconnect
  }, [projectRef, room, supabase, syncPresence, user])

  // Initialize channel
  useEffect(() => {
    if (!enabled || !projectRef || !room) return

    const channelName = `presence:${projectRef}:${room}`
    const channel = supabase.channel(channelName)

    channel
      .on('presence', { event: 'sync' }, () => {
        syncPresence(channel.presenceState())
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        setUsers(prev => [...prev, ...(newPresences as PresenceUser[])])
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        const leftIds = new Set((leftPresences as PresenceUser[]).map(p => p.id))
        setUsers(prev => prev.filter(u => !leftIds.has(u.id)))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true)
          await channel.track(user)
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsConnected(false)
          scheduleReconnect()
        }
      })

    channelRef.current = channel

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
    }
  }, [enabled, projectRef, room, supabase, syncPresence, user, scheduleReconnect])

  return {
    users,
    isConnected,
    currentUser: user,
  }
}
