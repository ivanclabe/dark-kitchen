/**
 * Voice preferences of this device (ADR 0033): «Oye Quanela» is the voice of
 * the whole app, so its keys are no longer the kitchen's. The first read
 * moves what the device had chosen under the old key (dk-kitchen-*), so
 * nobody has to choose again.
 */
export const VOICE_KEYS = {
  handsFree: { key: 'dk-voice-hands-free', legacy: 'dk-kitchen-wake-word' },
  recognizer: { key: 'dk-voice-recognizer', legacy: 'dk-kitchen-recognizer' },
  devicePin: { key: 'dk-voice-device', legacy: 'dk-kitchen-voice-device' },
  replies: { key: 'dk-voice-replies', legacy: 'dk-kitchen-voice-tts' },
  /** Read Copilot's answers to typed questions too (🔊 in the panel). New: no legacy key. */
  readTyped: { key: 'dk-voice-read-typed', legacy: null },
  /** After «Oye Quanela», keep listening for the next question (ADR 0038). New: no legacy key. */
  followUp: { key: 'dk-voice-follow-up', legacy: null },
} as const

export type VoicePref = keyof typeof VOICE_KEYS

export function readVoicePref(pref: VoicePref): string | null {
  const { key, legacy } = VOICE_KEYS[pref]
  try {
    const value = localStorage.getItem(key)
    if (value !== null || !legacy) return value
    const old = localStorage.getItem(legacy)
    if (old !== null) {
      localStorage.setItem(key, old)
      localStorage.removeItem(legacy)
    }
    return old
  } catch {
    return null
  }
}

export function writeVoicePref(pref: VoicePref, value: string | null) {
  const { key, legacy } = VOICE_KEYS[pref]
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
    if (legacy) localStorage.removeItem(legacy)
  } catch {
    // Blocked storage: the choice lasts until the page reloads.
  }
}
