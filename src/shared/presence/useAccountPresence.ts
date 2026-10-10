import { useAuth } from '@/shared/hooks/useAuth'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { statusFor, type PresenceStatus } from './presence'
import { EMPTY_PRESENCE, presenceSession, type PresenceSnapshot } from './presenceStore'

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const

/** Active, or away after 5 minutes hidden or without use (ADR 0050, D3). */
function usePresenceStatus(): PresenceStatus {
  const [status, setStatus] = useState<PresenceStatus>('active')
  const lastActivity = useRef(0)

  useEffect(() => {
    lastActivity.current = Date.now()
    const touch = () => {
      if (document.visibilityState !== 'visible') return
      lastActivity.current = Date.now()
      setStatus('active')
    }
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, touch, { passive: true })
    document.addEventListener('visibilitychange', touch)
    const timer = window.setInterval(() => {
      // A hidden tab stops counting as activity: its last use is when it was hidden.
      setStatus(statusFor(lastActivity.current, Date.now()))
    }, 30_000)
    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, touch)
      document.removeEventListener('visibilitychange', touch)
      window.clearInterval(timer)
    }
  }, [])
  return status
}

/**
 * Who is online in the active account (ADR 0050): this tab is in the
 * account's private presence channel (only people of the business may,
 * dk_presence_allowed) and announces name, avatar, role and active/away.
 * Every indicator on screen shares one channel (presenceStore). Nothing is
 * stored: leaving the account or closing the tab removes it.
 */
export function useAccountPresence(): PresenceSnapshot {
  const { profile } = useAuth()
  const { kitchen } = useActiveKitchen()
  const status = usePresenceStatus()
  const userId = profile?.id ?? null
  const session = userId ? presenceSession(kitchen.id, userId) : null

  const snapshot = useSyncExternalStore(
    useCallback((listener: () => void) => (session ? session.subscribe(listener) : () => {}), [session]),
    () => (session ? session.getSnapshot() : EMPTY_PRESENCE),
  )

  // While this indicator is on screen, the channel stays open.
  useEffect(() => (session ? session.retain() : undefined), [session])

  const name = profile?.fullName || 'Sin nombre'
  const avatarKey = profile?.avatarKey ?? null
  useEffect(() => {
    if (session && userId) session.setMeta({ userId, name, avatarKey, roleName: kitchen.roleName, status })
  }, [session, userId, name, avatarKey, kitchen.roleName, status])

  return snapshot
}
