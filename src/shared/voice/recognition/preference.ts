import { useCallback, useSyncExternalStore } from 'react'
import { readVoicePref, writeVoicePref } from '../devicePrefs'

/**
 * Speech-recognition engine chosen on this device (ADR 0015). Per device,
 * like the pinned voice and the sound switch: each kitchen tablet decides.
 */
export type RecognizerId = 'browser' | 'vosk'

const EVENT = 'dk-recognizer-pref'

export function readRecognizerPreference(): RecognizerId {
  try {
    return readVoicePref('recognizer') === 'vosk' ? 'vosk' : 'browser'
  } catch {
    return 'browser'
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

export function useRecognizerPreference(): [RecognizerId, (id: RecognizerId) => void] {
  const value = useSyncExternalStore(subscribe, readRecognizerPreference, () => 'browser' as const)
  const set = useCallback((id: RecognizerId) => {
    writeVoicePref('recognizer', id === 'browser' ? null : id)
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [value, set]
}
