import { useCallback, useSyncExternalStore } from 'react'
import { readVoicePref, writeVoicePref } from '../devicePrefs'

/**
 * "Manos libres" on this device (ADR 0016). Off by default: the microphone
 * stays open only on the tablets where someone switched it on.
 */
const EVENT = 'dk-wake-word-pref'

export function readWakeWordPreference(): boolean {
  try {
    return readVoicePref('handsFree') === 'on'
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
    writeVoicePref('handsFree', on ? 'on' : null)
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [value, set]
}
