import { useSyncExternalStore } from 'react'

/**
 * The sidebar folded to icons or not (ADR 0072), chosen per device. Without a choice it starts folded on
 * medium screens (768-1279 px) and open on wide ones.
 */
const KEY = 'dk-sidebar-collapsed'
const listeners = new Set<() => void>()

function read(): boolean | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw === null ? null : raw === '1'
  } catch {
    return null
  }
}

let chosen: boolean | null = read()

export function setSidebarCollapsed(value: boolean) {
  chosen = value
  try {
    localStorage.setItem(KEY, value ? '1' : '0')
  } catch {
    // Blocked storage: the choice lasts for this visit.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 1279px)') : null
  media?.addEventListener?.('change', listener)
  return () => {
    listeners.delete(listener)
    media?.removeEventListener?.('change', listener)
  }
}

function snapshot(): boolean {
  if (chosen !== null) return chosen
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1279px)').matches
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
