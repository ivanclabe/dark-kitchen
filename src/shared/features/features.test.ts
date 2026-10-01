import { describe, expect, it } from 'vitest'
import { FEATURE_KEYS, featureLookup, unavailableReason, type FeatureState } from './features'

// Every migration as text (Vite ?raw): features are seeded by the catalog and by later ones (e.g. ADR 0016).
const migrations = import.meta.glob<string>('../../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true })
const catalogSql = Object.values(migrations).join('\n')

const state = (over: Partial<FeatureState>): FeatureState => ({
  key: 'voice_commands',
  category: 'voice',
  label: 'Comandos de voz',
  description: '',
  usesModel: false,
  platformActive: true,
  includedInPlan: true,
  available: true,
  enabled: true,
  usable: true,
  canManage: false,
  canConfigure: false,
  accountOverride: true,
  settings: {},
  inheritedSettings: {},
  dependsOn: [],
  updatedAt: null,
  ...over,
})

describe('funciones', () => {
  it('la app conoce las mismas claves que siembra la migración del catálogo', () => {
    // Rows of the catalog inserts: "  ('key', 'ai', …" or "values ('key', 'ai', …" (Copilot, ADR 0020).
    const seeded = [...catalogSql.matchAll(/^\s*(?:values\s*)?\(?'([a-z_]+)', '(?:ai|voice|general)'/gm)].map((m) => m[1])
    expect(seeded.sort()).toEqual([...FEATURE_KEYS].sort())
  })

  it('usa solo el resultado de la base (usable); mientras carga, nada se puede usar', () => {
    const empty = featureLookup(undefined)
    expect(empty.canUseFeature('voice_commands')).toBe(false)
    const lookup = featureLookup([state({}), state({ key: 'supply_reorder', category: 'ai', usable: false, enabled: true, available: false })])
    expect(lookup.canUseFeature('voice_commands')).toBe(true)
    expect(lookup.canUseFeature('supply_reorder')).toBe(false)
    expect(lookup.feature('supply_reorder')?.enabled).toBe(true)
  })

  it('explica por qué no se puede usar, en orden de precedencia', () => {
    expect(unavailableReason(state({ includedInPlan: false, available: false, usable: false }))).toBe('plan')
    expect(unavailableReason(state({ available: false, enabled: false, usable: false }))).toBe('organization')
    expect(unavailableReason(state({ enabled: false, usable: false }))).toBe('account')
    expect(unavailableReason(state({ usable: false }))).toBe('permission')
    expect(unavailableReason(state({}))).toBeNull()
  })
})

describe('ADR 0014: interruptor global de la plataforma', () => {
  it('apagada por la plataforma: es lo primero que se explica', () => {
    expect(unavailableReason(state({ platformActive: false, includedInPlan: false, usable: false }))).toBe('platform')
    expect(featureLookup([state({ platformActive: false, usable: false })]).canUseFeature('voice_commands')).toBe(false)
  })
})
