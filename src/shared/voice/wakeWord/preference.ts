import { useCallback, useSyncExternalStore } from 'react'

/**
 * "Manos libres" on this device (ADR 0016). Off by default: the microphone
 * stays open only on the tablets where someone switched it on.
 */
const KEY = 'dk-kitchen-wake-word'
const EVENT = 'dk-wake-word-pref'

export function readWakeWordPreference(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

export function useWakeWordPreference(): [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(subscribe, readWakeWordPreference, () => false)
  const set = useCallback((on: boolean) => {
    try {
      if (on) localStorage.setItem(KEY, 'on')
      else localStorage.removeItem(KEY)
    } catch {
      // Blocked storage: the choice lasts until the page reloads.
    }
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [value, set]
}
