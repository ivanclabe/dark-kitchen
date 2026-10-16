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

/**
 * ADR 0063: settings of the features that are not analyses. Same types and ranges as dk_features.settings_schema
 * (catalog.test.ts checks them against the migration).
 */
export const EXTRA_FIELDS: Partial<Record<FeatureKey, EditableField[]>> = {
  copilot: [
    { key: 'voice_fallback', label: 'Responder por voz lo que ninguna pantalla entiende', type: 'boolean', hint: 'Apagado, «Oye Quanela» solo ejecuta comandos de pantalla: no hace preguntas a Copilot.' },
    { key: 'follow_up', label: 'Seguir escuchando después de responder', type: 'boolean', hint: 'Apagado, cada pregunta empieza con «Oye Quanela» (menos consultas por ruido).' },
  ],
  invoice_import: [
    { key: 'read_on_drop', label: 'Leer la factura apenas se sube', type: 'boolean', hint: 'Apagado, se pide confirmar antes de leer. Cada lectura es una consulta a la IA.' },
  ],
  ai_budget: [
    { key: 'monthly_runs', label: 'Consultas a la IA por mes', type: 'number', unit: 'consultas', min: 0, max: 100000, hint: '0 = sin límite de consultas.' },
    { key: 'monthly_usd', label: 'Costo estimado por mes', type: 'number', unit: 'USD', min: 0, max: 10000, hint: '0 = sin límite de costo. Usa los precios que fija la plataforma.' },
    { key: 'alert_pct', label: 'Avisar al llegar al', type: 'number', unit: '%', min: 50, max: 100 },
  ],
  // ADR 0063 (D4–D6): rules that warn and propose; nothing changes a price on its own.
  cost_controls: [
    { key: 'target_food_cost_pct', label: 'Costo de comida objetivo', type: 'number', unit: '%', min: 10, max: 90, hint: 'Costo del plato ÷ precio. Por encima, el plato se marca y se propone un precio.' },
    { key: 'price_change_pct', label: 'Avisar si un precio cambia más de', type: 'number', unit: '%', min: 1, max: 100, hint: 'Frente a la última compra y al promedio de 90 días.' },
    { key: 'reorder_days', label: 'Reponer para', type: 'number', unit: 'días', min: 1, max: 60, hint: 'La sugerencia de compra cubre el consumo de estos días.' },
  ],
}

export function fieldsFor(key: FeatureKey): EditableField[] {
  if (key === 'voice_wake_word') return WAKE_WORD_FIELDS
  const extra = EXTRA_FIELDS[key]
  if (extra) return extra
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
