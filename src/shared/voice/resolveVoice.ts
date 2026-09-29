import type { KitchenVoiceSettings, VoiceProfile, VoiceVerbosity } from './catalog'
import { VOICE_STYLE_META } from './catalog'

/** The part of SpeechSynthesisVoice we rely on (keeps this testable without a browser). */
export interface DeviceVoice {
  name: string
  lang: string
  voiceURI: string
  default: boolean
  localService?: boolean
}

export type VoiceSource = 'pinned' | 'profile' | 'fallback' | 'none'

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function sameLang(a: string, b: string): boolean {
  return a.replace('_', '-').toLowerCase() === b.replace('_', '-').toLowerCase()
}

/** Installed voices for a language: exact locale first, then any Spanish voice. */
export function voicesForLang<T extends DeviceVoice>(voices: readonly T[], lang: string): T[] {
  const exact = voices.filter((v) => sameLang(v.lang, lang))
  if (exact.length > 0) return exact
  const base = lang.split('-')[0].toLowerCase()
  return voices.filter((v) => v.lang.toLowerCase().startsWith(base))
}

/**
 * Picks the installed voice for a profile on this device:
 *   1. the voice pinned on this device (if still installed),
 *   2. the first installed voice whose name matches the profile hints, in order,
 *   3. the device default for the language, or its first voice.
 */
export function resolveDeviceVoice<T extends DeviceVoice>(
  voices: readonly T[],
  profile: Pick<VoiceProfile, 'deviceVoiceHints'> | null,
  lang: string,
  pinnedVoiceURI?: string | null,
): { voice: T | null; source: VoiceSource } {
  if (pinnedVoiceURI) {
    const pinned = voices.find((v) => v.voiceURI === pinnedVoiceURI)
    if (pinned) return { voice: pinned, source: 'pinned' }
  }
  const candidates = voicesForLang(voices, lang)
  for (const hint of profile?.deviceVoiceHints ?? []) {
    const wanted = normalize(hint)
    const match = candidates.find((v) => normalize(v.name).includes(wanted))
    if (match) return { voice: match, source: 'profile' }
  }
  const fallback = candidates.find((v) => v.default) ?? candidates[0] ?? null
  return { voice: fallback, source: fallback ? 'fallback' : 'none' }
}

export interface UtteranceParams<T extends DeviceVoice = DeviceVoice> {
  lang: string
  rate: number
  pitch: number
  volume: number
  voice: T | null
}

export interface EffectiveVoice<T extends DeviceVoice = DeviceVoice> {
  settings: KitchenVoiceSettings
  profile: VoiceProfile | null
  verbosity: VoiceVerbosity
  source: VoiceSource
  params: UtteranceParams<T>
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Settings + catalog + installed voices → what the device will actually say. */
export function effectiveVoice<T extends DeviceVoice>(
  settings: KitchenVoiceSettings,
  profiles: readonly VoiceProfile[],
  voices: readonly T[],
  pinnedVoiceURI?: string | null,
): EffectiveVoice<T> {
  // An inactive or unknown profile falls back to the first active one.
  const profile = profiles.find((p) => p.key === settings.profile && p.active) ?? profiles.find((p) => p.active) ?? null
  const style = VOICE_STYLE_META[settings.style]
  const { voice, source } = resolveDeviceVoice(voices, profile, settings.lang, pinnedVoiceURI)
  return {
    settings,
    profile,
    verbosity: style.verbosity,
    source,
    params: {
      lang: settings.lang,
      rate: clamp(settings.rate * style.rateFactor, 0.5, 2),
      pitch: clamp((profile?.pitch ?? 1) * style.pitchFactor, 0.5, 2),
      volume: clamp(settings.volume, 0, 1),
      voice,
    },
  }
}
