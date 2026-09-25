import { supabase } from '@/shared/lib/supabase'
import type { Json } from '@/types/database'

/**
 * Funciones opcionales (ADR 0009, sección 3.2). El catálogo vive en la base
 * (dk_features); estas claves son las que la app conoce. La base decide si
 * una función se puede usar:
 *
 *   usable = la organización la ofrece ∧ la Cuenta la activó ∧ el rol activo tiene el permiso
 *
 * La app solo lee ese resultado (dk_my_features): ningún componente decide
 * por su cuenta.
 */
export const FEATURE_KEYS = [
  'supply_reorder',
  'supply_perishables',
  'supply_slow_movers',
  'kitchen_stall_alerts',
  'kitchen_insights',
  'voice_commands',
  'voice_speech',
] as const

export type FeatureKey = (typeof FEATURE_KEYS)[number]
export type FeatureCategory = 'ai' | 'voice' | 'general'
export type FeatureSettings = Record<string, number | boolean>

export const FEATURE_CATEGORY_LABEL: Record<FeatureCategory, string> = {
  ai: 'Inteligencia artificial',
  voice: 'Voz',
  general: 'Generales',
}

/** Estado de una función en la Cuenta activa. */
export interface FeatureState {
  key: FeatureKey
  category: FeatureCategory
  label: string
  description: string
  usesModel: boolean
  /** ¿La organización la ofrece? */
  available: boolean
  /** Valor de la Cuenta (se conserva aunque la organización no la ofrezca). */
  enabled: boolean
  /** Resultado final: organización ∧ Cuenta ∧ permiso del rol activo. */
  usable: boolean
  /** ¿Quien consulta puede activarla/desactivarla en esta Cuenta? */
  canManage: boolean
  /** Parámetros: los del catálogo completados con los de la Cuenta. */
  settings: FeatureSettings
  updatedAt: string | null
}

export async function fetchMyFeatures(): Promise<FeatureState[]> {
  const { data, error } = await supabase.rpc('dk_my_features')
  if (error) throw error
  return (data as unknown as FeatureState[] | null) ?? []
}

export async function setKitchenFeature(kitchenId: string, key: FeatureKey, enabled: boolean, settings?: FeatureSettings): Promise<void> {
  const { error } = await supabase.rpc('dk_set_kitchen_feature', {
    p_kitchen_id: kitchenId,
    p_key: key,
    p_enabled: enabled,
    ...(settings ? { p_settings: settings as Json } : {}),
  })
  if (error) throw error
}

export async function setOrganizationFeature(organizationId: string, key: FeatureKey, available: boolean): Promise<void> {
  const { error } = await supabase.rpc('dk_set_org_feature', { p_organization_id: organizationId, p_key: key, p_available: available })
  if (error) throw error
}

/** Matriz de la organización: qué ofrece y qué tiene activado cada Cuenta (solo SUPER_ADMIN). */
export interface FeatureMatrix {
  features: { key: FeatureKey; category: FeatureCategory; label: string; description: string; usesModel: boolean; available: boolean }[]
  accounts: { id: string; name: string; slug: string; iconKey: string | null; active: boolean; enabled: Record<FeatureKey, boolean> }[]
}

export async function fetchFeatureMatrix(organizationId: string): Promise<FeatureMatrix> {
  const { data, error } = await supabase.rpc('dk_org_feature_matrix', { p_organization_id: organizationId })
  if (error) throw error
  return data as unknown as FeatureMatrix
}

export interface FeatureLookup {
  features: readonly FeatureState[]
  feature: (key: FeatureKey) => FeatureState | null
  /** ¿Se puede usar en la Cuenta activa con el rol activo? Mientras carga: no. */
  canUseFeature: (key: FeatureKey) => boolean
}

export function featureLookup(features: readonly FeatureState[] | undefined): FeatureLookup {
  const list = features ?? []
  const byKey = new Map(list.map((f) => [f.key, f]))
  return {
    features: list,
    feature: (key) => byKey.get(key) ?? null,
    canUseFeature: (key) => byKey.get(key)?.usable === true,
  }
}

/** Por qué una función no se puede usar (para explicarlo en pantalla). */
export function unavailableReason(state: FeatureState | null): 'organization' | 'account' | 'permission' | null {
  if (!state) return 'organization'
  if (!state.available) return 'organization'
  if (!state.enabled) return 'account'
  if (!state.usable) return 'permission'
  return null
}
