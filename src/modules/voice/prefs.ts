import { readVoicePref, writeVoicePref, type VoicePref } from '@/shared/voice/devicePrefs'
import { useCallback, useSyncExternalStore } from 'react'

const EVENT = 'dk-voice-pref'

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

/** An on/off voice preference of this device (ADR 0033). */
export function useVoiceFlag(pref: Extract<VoicePref, 'replies' | 'readTyped'>, fallback: boolean): [boolean, (on: boolean) => void] {
  const read = useCallback(() => {
    const v = readVoicePref(pref)
    return v === null ? fallback : v === 'on'
  }, [pref, fallback])
  const value = useSyncExternalStore(subscribe, read, () => fallback)
  const set = useCallback(
    (on: boolean) => {
      writeVoicePref(pref, on ? 'on' : 'off')
      window.dispatchEvent(new Event(EVENT))
    },
    [pref],
  )
  return [value, set]
}
