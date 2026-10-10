import { supabase } from '@/shared/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { summarizePresence, type OnlinePerson, type PresenceMeta } from './presence'

/**
 * ADR 0050 — ONE presence channel per account and person, shared by every
 * indicator on screen. Supabase hands back the same channel for the same
 * topic, and callbacks cannot be added once it is subscribed: so the channel
 * lives here, outside React, counted by its users. It closes a moment after
 * the last one leaves (a remount — React's StrictMode, a re-render of the
 * header — reuses it instead of opening another).
 */
export interface PresenceSnapshot {
  people: OnlinePerson[]
  connected: boolean
}

type Meta = Omit<PresenceMeta, 'onlineAt'>

const CLOSE_AFTER_MS = 1500
const EMPTY: PresenceSnapshot = { people: [], connected: false }

export interface PresenceSession {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => PresenceSnapshot
  /** A user of the session (a mounted indicator); returns its release. */
  retain: () => () => void
  /** What this tab announces (re-announced when it changes). */
  setMeta: (meta: Meta) => void
}

const sessions = new Map<string, PresenceSession>()
/** Channels still closing: a new one for the same topic waits for them. */
const closing = new Map<string, Promise<unknown>>()

function createSession(kitchenId: string, userId: string): PresenceSession {
  const key = `${kitchenId}:${userId}`
  const topic = `account:${kitchenId}:presence`
  const listeners = new Set<() => void>()
  let snapshot = EMPTY
  let channel: RealtimeChannel | null = null
  let meta: Meta | null = null
  let metaKey = ''
  let users = 0
  let closeTimer: number | null = null
  let closed = false
  const onlineAt = new Date().toISOString()

  const emit = (next: PresenceSnapshot) => {
    snapshot = next
    for (const l of listeners) l()
  }
  const announce = () => {
    if (channel && snapshot.connected && meta) void channel.track({ ...meta, onlineAt })
  }

  const open = () => {
    if (closed) return
    channel = supabase.channel(topic, { config: { private: true, presence: { key: userId } } })
    channel.on('presence', { event: 'sync' }, () => emit({ ...snapshot, people: summarizePresence(channel!.presenceState(), userId) }))
    channel.subscribe((state) => {
      if (state === 'SUBSCRIBED') {
        emit({ ...snapshot, connected: true })
        announce()
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
        emit({ ...snapshot, connected: false })
      }
    })
  }

  const close = () => {
    closed = true
    sessions.delete(key)
    if (!channel) return
    const done = supabase.removeChannel(channel).finally(() => closing.delete(topic))
    closing.set(topic, done)
    channel = null
  }

  const scheduleClose = () => {
    if (closeTimer !== null) window.clearTimeout(closeTimer)
    closeTimer = window.setTimeout(() => {
      closeTimer = null
      if (users === 0) close()
    }, CLOSE_AFTER_MS)
  }

  // A channel of this topic still closing must finish first (Supabase would hand it back).
  const pending = closing.get(topic)
  if (pending) void pending.then(open, open)
  else open()
  // Created but never used (a render React threw away): close it too.
  scheduleClose()

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    retain: () => {
      users += 1
      if (closeTimer !== null) {
        window.clearTimeout(closeTimer)
        closeTimer = null
      }
      let released = false
      return () => {
        if (released) return
        released = true
        users -= 1
        if (users === 0) scheduleClose()
      }
    },
    setMeta: (next) => {
      const nextKey = `${next.name}|${next.avatarKey}|${next.roleName}|${next.status}`
      meta = next
      if (nextKey === metaKey) return
      metaKey = nextKey
      announce()
    },
  }
}

/** The shared session of this account and person (created on first use). */
export function presenceSession(kitchenId: string, userId: string): PresenceSession {
  const key = `${kitchenId}:${userId}`
  let session = sessions.get(key)
  if (!session) {
    session = createSession(kitchenId, userId)
    sessions.set(key, session)
  }
  return session
}

export const EMPTY_PRESENCE = EMPTY
