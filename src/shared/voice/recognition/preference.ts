import { useCallback, useSyncExternalStore } from 'react'
import { readVoicePref, writeVoicePref } from '../devicePrefs'

/**
 * Speech-recognition engine chosen on this device (ADR 0015). Per device,
 * like the pinned voice and the sound switch: each kitchen tablet decides.
 *
 * ADR 0071: the local engine (Vosk) is the default — the audio never leaves
 * the device. The online one (the browser's Web Speech API: Chrome sends the
 * audio to Google) is opt-in: it only counts once this device accepted
 * ONLINE_RECOGNITION_NOTICE, and the acceptance is kept as a timestamp. A
 * device that had chosen it before the notice existed (a stored «browser»
 * without the timestamp) is back on the local engine until it accepts.
 */
export type RecognizerId = 'browser' | 'vosk'

export const ONLINE_RECOGNITION_NOTICE =
  'Con el reconocimiento en línea, el audio de lo que dices se envía a Google para convertirlo en texto. El reconocimiento local funciona en tu dispositivo y el audio no sale de él.'

const EVENT = 'dk-recognizer-pref'

/** When this device accepted the online notice (ISO timestamp), or null. */
export function onlineAcceptedAt(): string | null {
  return readVoicePref('onlineConsent')
}

export function readRecognizerPreference(): RecognizerId {
  try {
    return readVoicePref('recognizer') === 'browser' && onlineAcceptedAt() ? 'browser' : 'vosk'
  } catch {
    return 'vosk'
  }
}

/** This device used the online engine before the notice existed: it must accept it to keep using it. */
export function hadOnlineWithoutNotice(): boolean {
  return readVoicePref('recognizer') === 'browser' && !onlineAcceptedAt()
}

/** Only from the notice's accept action: records the acceptance and switches to the online engine. */
export function acceptOnlineRecognition(now: Date = new Date()) {
  writeVoicePref('onlineConsent', now.toISOString())
  writeVoicePref('recognizer', 'browser')
  window.dispatchEvent(new Event(EVENT))
}

/** Back to the local engine; the online one will show the notice again. */
export function chooseLocalRecognition() {
  writeVoicePref('recognizer', null)
  writeVoicePref('onlineConsent', null)
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

/** The engine in use and its setter: «browser» means the notice was just accepted (see OnlineRecognitionNotice). */
export function useRecognizerPreference(): [RecognizerId, (id: RecognizerId) => void] {
  const value = useSyncExternalStore(subscribe, readRecognizerPreference, () => 'vosk' as const)
  const set = useCallback((id: RecognizerId) => (id === 'browser' ? acceptOnlineRecognition() : chooseLocalRecognition()), [])
  return [value, set]
}
