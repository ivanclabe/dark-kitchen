import type { AiFeatureKey, AiSettings, InsightPriority } from '../types'

export interface SettingField {
  key: string
  label: string
  type: 'number' | 'boolean'
  unit?: string
  min?: number
  max?: number
  hint?: string
}

export interface FeatureDefinition {
  key: AiFeatureKey
  area: 'supply' | 'kitchen'
  title: string
  description: string
  /** false = regla fija, sin modelo (instantánea, no consume IA). */
  usesModel: boolean
  defaults: AiSettings
  fields: SettingField[]
}

const FREQUENCY: SettingField = {
  key: 'frequency_min',
  label: 'Analizar cada',
  type: 'number',
  unit: 'min',
  min: 5,
  max: 10080,
  hint: 'Mientras el análisis anterior esté vigente se reutiliza, sin volver a llamar a la IA.',
}

/**
 * Catálogo de funciones de IA. Los valores por defecto coinciden con los
 * de dk_features.default_settings (la fuente); aquí son solo el respaldo mientras carga. Si una fila no trae
 * alguna clave, se completa desde aquí.
 */
export const AI_FEATURES: FeatureDefinition[] = [
  {
    key: 'supply_reorder',
    area: 'supply',
    title: 'Sugerencias de compra',
    description: 'Prioriza qué reponer según el consumo real, la tendencia de la última semana y la cobertura, y explica por qué. Crear la compra siempre lo decides tú.',
    usesModel: true,
    defaults: { coverage_days: 7, frequency_min: 360 },
    fields: [
      { key: 'coverage_days', label: 'Alertar con cobertura menor a', type: 'number', unit: 'días', min: 1, max: 90, hint: 'También define qué aparece en «Reponer».' },
      FREQUENCY,
    ],
  },
  {
    key: 'supply_perishables',
    area: 'supply',
    title: 'Perecederos en riesgo',
    description: 'Detecta insumos perecederos que vencen pronto o no alcanzan a consumirse antes de vencer. La fecha se estima con las compras (no hay lotes).',
    usesModel: true,
    defaults: { warning_days: 2, frequency_min: 360 },
    fields: [{ key: 'warning_days', label: 'Avisar cuando falten', type: 'number', unit: 'días', min: 0, max: 30 }, FREQUENCY],
  },
  {
    key: 'supply_slow_movers',
    area: 'supply',
    title: 'Poco movimiento',
    description: 'Señala insumos que no se consumen o con stock excesivo para su ritmo: dinero inmovilizado.',
    usesModel: true,
    defaults: { slow_days: 21, overstock_days: 60, frequency_min: 1440 },
    fields: [
      { key: 'slow_days', label: 'Sin consumo durante', type: 'number', unit: 'días', min: 3, max: 365 },
      { key: 'overstock_days', label: 'Stock excesivo si dura más de', type: 'number', unit: 'días', min: 7, max: 365 },
      FREQUENCY,
    ],
  },
  {
    key: 'kitchen_stall_alerts',
    area: 'kitchen',
    title: 'Alertas de pedidos detenidos',
    description: 'Avisa en Cocina, y por voz si quieres, cuando un pedido o un plato lleva demasiado tiempo sin avanzar. Usa los umbrales de alertas (SLA) de Cocina.',
    usesModel: false,
    defaults: { dish_stall_min: 12, repeat_min: 5, voice: true },
    fields: [
      { key: 'dish_stall_min', label: 'Plato sin avanzar más de', type: 'number', unit: 'min', min: 3, max: 120 },
      { key: 'repeat_min', label: 'Repetir el aviso cada', type: 'number', unit: 'min', min: 1, max: 60 },
      { key: 'voice', label: 'Avisar por voz', type: 'boolean' },
    ],
  },
  {
    key: 'kitchen_insights',
    area: 'kitchen',
    title: 'Sugerencias de Cocina en vivo',
    description: 'Mira la cocina en tiempo real y sugiere qué priorizar, qué platos agrupar o qué despachar.',
    usesModel: true,
    defaults: { frequency_min: 10, voice: false },
    fields: [
      { ...FREQUENCY, min: 3, max: 120 },
      { key: 'voice', label: 'Leer la sugerencia principal en voz alta', type: 'boolean' },
    ],
  },
]

export function featureDefinition(key: AiFeatureKey): FeatureDefinition {
  const def = AI_FEATURES.find((f) => f.key === key)
  if (!def) throw new Error(`Función de IA desconocida: ${key}`)
  return def
}

/** Completa con los valores por defecto las claves que falten y descarta las que no correspondan. */
export function withDefaults(key: AiFeatureKey, settings: AiSettings | null | undefined): AiSettings {
  const def = featureDefinition(key)
  const result: AiSettings = {}
  for (const field of def.fields) {
    const value = settings?.[field.key]
    result[field.key] = typeof value === typeof def.defaults[field.key] ? (value as number | boolean) : def.defaults[field.key]
  }
  return result
}

/** Valida un valor de configuración contra su campo. null = válido. */
export function settingError(field: SettingField, value: number | boolean): string | null {
  if (field.type !== 'number') return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Ingresa un número'
  if (field.min !== undefined && value < field.min) return `Mínimo ${field.min}`
  if (field.max !== undefined && value > field.max) return `Máximo ${field.max}`
  return null
}

export function numberSetting(settings: AiSettings, key: string, fallback: number): number {
  const value = settings[key]
  return typeof value === 'number' ? value : fallback
}

/** Texto de cada acción que la IA puede sugerir (lista cerrada en la Edge Function). */
export const ACTION_LABEL: Record<string, string> = {
  crear_borrador_compra: 'Crear borrador de compra',
  revisar_minimos: 'Revisar mínimo y máximo',
  revisar_proveedor: 'Asignar o revisar proveedor',
  usar_primero: 'Usar primero',
  no_recomprar: 'No volver a comprar por ahora',
  ajustar_minimo: 'Ajustar el mínimo',
  registrar_merma: 'Registrar merma si ya venció',
  usar_en_menu: 'Incluir en el menú',
  revisar_receta: 'Revisar recetas',
  priorizar_pedido: 'Priorizar pedido',
  revisar_plato: 'Revisar plato',
  despachar: 'Despachar',
  agrupar_preparacion: 'Preparar en lote',
  reforzar_estacion: 'Reforzar estación',
  informativo: 'Para tener en cuenta',
}

export const PRIORITY_ORDER: Record<InsightPriority, number> = { alta: 0, media: 1, baja: 2 }
