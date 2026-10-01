import { useCallback, useSyncExternalStore } from 'react'

/**
 * Speech-recognition engine chosen on this device (ADR 0015). Per device,
 * like the pinned voice and the sound switch: each kitchen tablet decides.
 */
export type RecognizerId = 'browser' | 'vosk'

const KEY = 'dk-kitchen-recognizer'
const EVENT = 'dk-recognizer-pref'

export function readRecognizerPreference(): RecognizerId {
  try {
    return localStorage.getItem(KEY) === 'vosk' ? 'vosk' : 'browser'
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
    try {
      if (id === 'browser') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, id)
    } catch {
      // Blocked storage: the choice lasts until the page reloads.
    }
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [value, set]
}
