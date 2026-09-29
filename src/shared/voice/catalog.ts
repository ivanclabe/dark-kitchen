import { supabase } from '@/shared/lib/supabase'

/**
 * Kitchen voice catalog (ADR 0014). Profiles live in dk_voice_profiles and
 * are managed by the platform; each device resolves a profile to one of its
 * installed voices (provider "device" = the browser's speech synthesis).
 */
export const VOICE_STYLES = ['friendly', 'professional', 'energetic', 'calm', 'direct', 'natural', 'minimal'] as const
export type VoiceStyle = (typeof VOICE_STYLES)[number]
export type VoiceGender = 'female' | 'male' | 'neutral'
export type VoiceVerbosity = 'standard' | 'minimal'

export const VOICE_LANGS = ['es-CO', 'es-MX', 'es-ES', 'es-US'] as const
export type VoiceLang = (typeof VOICE_LANGS)[number]

export const VOICE_LANG_LABEL: Record<VoiceLang, string> = {
  'es-CO': 'Español (Colombia)',
  'es-MX': 'Español (México)',
  'es-ES': 'Español (España)',
  'es-US': 'Español (EE. UU.)',
}

export const VOICE_GENDER_LABEL: Record<VoiceGender, string> = { female: 'Femenina', male: 'Masculina', neutral: 'Neutra' }

/**
 * With the device voice, a style is what is technically possible: speed,
 * pitch and how long the phrases are. No emotional synthesis is implied.
 */
export const VOICE_STYLE_META: Record<VoiceStyle, { label: string; description: string; rateFactor: number; pitchFactor: number; verbosity: VoiceVerbosity }> = {
  friendly: { label: 'Amable', description: 'Cálida y cercana.', rateFactor: 1, pitchFactor: 1.05, verbosity: 'standard' },
  professional: { label: 'Profesional', description: 'Clara y serena.', rateFactor: 1, pitchFactor: 1, verbosity: 'standard' },
  energetic: { label: 'Enérgica', description: 'Más rápida para la hora pico.', rateFactor: 1.12, pitchFactor: 1.05, verbosity: 'standard' },
  calm: { label: 'Tranquila', description: 'Pausada y suave.', rateFactor: 0.92, pitchFactor: 0.97, verbosity: 'standard' },
  direct: { label: 'Directa', description: 'Rápida y con frases cortas.', rateFactor: 1.08, pitchFactor: 1, verbosity: 'minimal' },
  natural: { label: 'Natural', description: 'Lo más parecida a una conversación.', rateFactor: 1, pitchFactor: 1, verbosity: 'standard' },
  minimal: { label: 'Mínima', description: 'Solo lo esencial, para alta velocidad.', rateFactor: 1.15, pitchFactor: 1, verbosity: 'minimal' },
}

export interface VoiceProfile {
  key: string
  name: string
  gender: VoiceGender
  defaultStyle: VoiceStyle
  pitch: number
  lang: VoiceLang
  provider: 'device'
  deviceVoiceHints: string[]
  description: string
  active: boolean
  sortOrder: number
}

/** Settings of the voice_speech feature (platform → organization → account). */
export interface KitchenVoiceSettings {
  profile: string
  style: VoiceStyle
  rate: number
  volume: number
  lang: VoiceLang
}

export const DEFAULT_VOICE_SETTINGS: KitchenVoiceSettings = { profile: 'laura', style: 'natural', rate: 1, volume: 1, lang: 'es-CO' }

export const VOICE_RATE = { min: 0.7, max: 1.5, step: 0.05 } as const
export const VOICE_VOLUME = { min: 0.1, max: 1, step: 0.05 } as const

/** Normalizes raw feature settings (unknown keys/types fall back to defaults). */
export function toVoiceSettings(raw: Record<string, unknown> | null | undefined): KitchenVoiceSettings {
  const value = raw ?? {}
  const style = VOICE_STYLES.includes(value.style as VoiceStyle) ? (value.style as VoiceStyle) : DEFAULT_VOICE_SETTINGS.style
  const lang = VOICE_LANGS.includes(value.lang as VoiceLang) ? (value.lang as VoiceLang) : DEFAULT_VOICE_SETTINGS.lang
  const number = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
  return {
    profile: typeof value.profile === 'string' && value.profile ? value.profile : DEFAULT_VOICE_SETTINGS.profile,
    style,
    rate: number(value.rate, DEFAULT_VOICE_SETTINGS.rate, VOICE_RATE.min, VOICE_RATE.max),
    volume: number(value.volume, DEFAULT_VOICE_SETTINGS.volume, VOICE_VOLUME.min, VOICE_VOLUME.max),
    lang,
  }
}

export const VOICE_PROFILES_KEY = ['voice-profiles'] as const

interface VoiceProfileRow {
  key: string
  name: string
  gender: VoiceGender
  default_style: VoiceStyle
  pitch: number
  lang: VoiceLang
  provider: 'device'
  device_voice_hints: string[]
  description: string
  active: boolean
  sort_order: number
}

/** Active profiles for everyone; the platform also sees inactive ones (RLS). */
export async function fetchVoiceProfiles(): Promise<VoiceProfile[]> {
  const { data, error } = await supabase.from('dk_voice_profiles').select('*').order('sort_order')
  if (error) throw error
  return ((data ?? []) as VoiceProfileRow[]).map((r) => ({
    key: r.key,
    name: r.name,
    gender: r.gender,
    defaultStyle: r.default_style,
    pitch: Number(r.pitch),
    lang: r.lang,
    provider: r.provider,
    deviceVoiceHints: r.device_voice_hints ?? [],
    description: r.description,
    active: r.active,
    sortOrder: r.sort_order,
  }))
}

export function profileLabel(profile: VoiceProfile): string {
  return `${profile.name} — ${VOICE_STYLE_META[profile.defaultStyle].label}, ${VOICE_GENDER_LABEL[profile.gender].toLowerCase()}`
}
