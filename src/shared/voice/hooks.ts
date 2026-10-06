import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { fetchVoiceProfiles, toVoiceSettings, VOICE_PROFILES_KEY, type KitchenVoiceSettings, type VoiceProfile, type VoiceVerbosity } from './catalog'
import { effectiveVoice, type EffectiveVoice } from './resolveVoice'
import { readVoicePref, writeVoicePref } from './devicePrefs'
import { deviceSpeech, type SpeechPriority } from './speechQueue'

export function useVoiceProfiles() {
  return useQuery({ queryKey: VOICE_PROFILES_KEY, queryFn: fetchVoiceProfiles, staleTime: 10 * 60_000 })
}

/** Installed voices of this device; they load asynchronously in most browsers. */
export function useDeviceVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() =>
    typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis.getVoices() : [],
  )
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const synth = window.speechSynthesis
    const update = () => setVoices(synth.getVoices())
    update()
    synth.addEventListener?.('voiceschanged', update)
    return () => synth.removeEventListener?.('voiceschanged', update)
  }, [])
  return voices
}

// ---------------------------------------------------------------------------
// Voice pinned on this device (localStorage, per device like mute and sound)
// ---------------------------------------------------------------------------
const PIN_EVENT = 'dk-voice-pin'

function readPin(): string | null {
  return readVoicePref('devicePin')
}

function subscribePin(callback: () => void) {
  window.addEventListener(PIN_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(PIN_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

export function useDeviceVoicePin(): [string | null, (voiceURI: string | null) => void] {
  const pin = useSyncExternalStore(subscribePin, readPin, () => null)
  const setPin = useCallback((voiceURI: string | null) => {
    writeVoicePref('devicePin', voiceURI)
    window.dispatchEvent(new Event(PIN_EVENT))
  }, [])
  return [pin, setPin]
}

/** Effective voice for given settings on this device (used by forms and previews). */
export function useEffectiveVoice(settings: KitchenVoiceSettings, profiles: readonly VoiceProfile[] | undefined): EffectiveVoice<SpeechSynthesisVoice> {
  const voices = useDeviceVoices()
  const [pin] = useDeviceVoicePin()
  return useMemo(() => effectiveVoice(settings, profiles ?? [], voices, pin), [settings, profiles, voices, pin])
}

/** Speaks a sample with exactly these settings (clears anything pending first). */
export function previewVoice(text: string, voice: EffectiveVoice<SpeechSynthesisVoice>): boolean {
  deviceSpeech.clear()
  return deviceSpeech.enqueue(text, 'command', voice.params)
}

export type SpokenText = string | ((verbosity: VoiceVerbosity) => string | null)

/**
 * The only way Quanela speaks (ADR 0014, ADR 0033: the whole app, not only
 * the kitchen). Gate: the voice_speech feature (platform ∧ plan ∧
 * organization ∧ account ∧ permission voice.use, decided by the database).
 * Callers add their own switches (device preference, `voice` parameter of an
 * AI feature), which can only turn it off.
 */
export function useQuanelaVoice() {
  const { canUseFeature, feature } = useActiveKitchen()
  const allowed = canUseFeature('voice_speech')
  const rawSettings = feature('voice_speech')?.settings
  const settings = useMemo(() => toVoiceSettings(rawSettings), [rawSettings])
  const { data: profiles } = useVoiceProfiles()
  const voice = useEffectiveVoice(settings, profiles)

  const say = useCallback(
    (text: SpokenText, priority: SpeechPriority = 'command') => {
      if (!allowed) return false
      const spoken = typeof text === 'function' ? text(voice.verbosity) : text
      return spoken ? deviceSpeech.enqueue(spoken, priority, voice.params) : false
    },
    [allowed, voice],
  )
  return { allowed, say, verbosity: voice.verbosity, voice }
}
