import { AI_FEATURES, settingError, type SettingField } from '@/modules/ai/lib/catalog'
import type { FeatureKey, FeatureSettings } from '@/shared/features/features'

/**
 * Settings the organization tunes for each feature (ADR 0018). AI fields come
 * from the AI catalog; the wake word exposes one plain-language choice over
 * its detection threshold. The kitchen voice has its own form (Voz de cocina).
 */
export interface ChoiceField {
  key: string
  label: string
  type: 'choice'
  options: { value: number; label: string }[]
  hint?: string
}

export type EditableField = SettingField | ChoiceField

const WAKE_WORD_FIELDS: EditableField[] = [
  {
    key: 'threshold',
    label: 'Sensibilidad de «Oye Quanela»',
    type: 'choice',
    options: [
      { value: 0.8, label: 'Alta: responde más fácil' },
      { value: 0.9, label: 'Normal (recomendada)' },
      { value: 0.97, label: 'Estricta: menos activaciones por error' },
    ],
    hint: 'Súbela si se activa sola; bájala si hay que repetir la frase.',
  },
]

export function fieldsFor(key: FeatureKey): EditableField[] {
  if (key === 'voice_wake_word') return WAKE_WORD_FIELDS
  return AI_FEATURES.find((f) => f.key === key)?.fields ?? []
}

export function fieldError(field: EditableField, value: unknown): string | null {
  if (field.type === 'choice') return typeof value === 'number' ? null : 'Elige una opción'
  return settingError(field, value as number | boolean)
}

/** "12 min · repetir 5 min · voz" — compact reading of the values. */
export function settingsSummary(key: FeatureKey, settings: FeatureSettings): string {
  return fieldsFor(key)
    .map((f) => {
      const v = settings[f.key]
      if (v === undefined) return null
      if (f.type === 'boolean') return v ? f.label : null
      if (f.type === 'choice') return f.options.find((o) => o.value === v)?.label.split(':')[0] ?? String(v)
      return `${v}${f.unit ? ` ${f.unit}` : ''}`
    })
    .filter(Boolean)
    .join(' · ')
}

/** Only the keys whose value differs from `base` (what an exception needs to store). */
export function diffFrom(base: FeatureSettings, values: FeatureSettings): FeatureSettings {
  return Object.fromEntries(Object.entries(values).filter(([k, v]) => base[k] !== v))
}
