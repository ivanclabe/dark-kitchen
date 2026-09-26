import { describe, expect, it } from 'vitest'
// La migración del catálogo como texto (Vite ?raw).
import catalogSql from '../../../supabase/migrations/20260926110000_dk_feature_catalog.sql?raw'
import { FEATURE_KEYS, featureLookup, unavailableReason, type FeatureState } from './features'

const state = (over: Partial<FeatureState>): FeatureState => ({
  key: 'voice_commands',
  category: 'voice',
  label: 'Comandos de voz',
  description: '',
  usesModel: false,
  includedInPlan: true,
  available: true,
  enabled: true,
  usable: true,
  canManage: false,
  settings: {},
  updatedAt: null,
  ...over,
})

describe('funciones', () => {
  it('la app conoce las mismas claves que siembra la migración del catálogo', () => {
    const seeded = [...catalogSql.matchAll(/^\s+\('([a-z_]+)', '(?:ai|voice|general)'/gm)].map((m) => m[1])
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
