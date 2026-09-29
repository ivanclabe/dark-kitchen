import { describe, expect, it } from 'vitest'
// El esquema de parámetros de la base, como texto (Vite ?raw).
import schemaSql from '../../../../supabase/migrations/20260928100000_dk_ai_quota_and_settings_schema.sql?raw'
import { AI_FEATURES, featureDefinition, retryLabel, settingError, withDefaults } from './catalog'

describe('withDefaults', () => {
  it('completa claves faltantes y descarta las desconocidas', () => {
    expect(withDefaults('supply_slow_movers', { slow_days: 30, otra: 1 })).toEqual({ slow_days: 30, overstock_days: 60, frequency_min: 1440 })
  })
  it('ignora valores con tipo equivocado', () => {
    expect(withDefaults('kitchen_stall_alerts', { voice: 'si' as unknown as boolean, dish_stall_min: 8 })).toEqual({ dish_stall_min: 8, repeat_min: 5, voice: true })
  })
  it('cada campo tiene su valor por defecto', () => {
    for (const def of AI_FEATURES) for (const field of def.fields) expect(def.defaults[field.key], `${def.key}.${field.key}`).toBeDefined()
  })
})

describe('settingError', () => {
  const field = featureDefinition('supply_reorder').fields[0]
  it('valida rango', () => {
    expect(settingError(field, 7)).toBeNull()
    expect(settingError(field, 0)).toBe('Mínimo 1')
    expect(settingError(field, 91)).toBe('Máximo 90')
    expect(settingError(field, Number.NaN)).toBe('Ingresa un número')
  })
})

describe('rangos de la app = esquema de la base (ADR 0011)', () => {
  const schemas = Object.fromEntries(
    [...schemaSql.matchAll(/when '([a-z_]+)' then '(\{.*\})'/g)].map((m) => [m[1], JSON.parse(m[2]) as Record<string, { type: string; min?: number; max?: number }>]),
  )

  it('cada función de la app tiene su esquema en la base con los mismos tipos y rangos', () => {
    for (const def of AI_FEATURES) {
      const schema = schemas[def.key]
      expect(schema, def.key).toBeDefined()
      expect(Object.keys(schema).sort(), def.key).toEqual(def.fields.map((f) => f.key).sort())
      for (const field of def.fields) {
        const rule = schema[field.key]
        expect(rule.type, `${def.key}.${field.key}`).toBe(field.type)
        if (field.type === 'number') {
          expect(rule.min, `${def.key}.${field.key} min`).toBe(field.min)
          expect(rule.max, `${def.key}.${field.key} max`).toBe(field.max)
        }
      }
    }
  })

  it('los valores por defecto están dentro del rango', () => {
    for (const def of AI_FEATURES) for (const field of def.fields) expect(settingError(field, def.defaults[field.key]), `${def.key}.${field.key}`).toBeNull()
  })
})

describe('retryLabel', () => {
  it('dice cuándo reintentar', () => {
    expect(retryLabel(90)).toBe('en 2 min')
    expect(retryLabel(7200)).toBe('en 2 h')
    expect(retryLabel(null)).toBe('en un momento')
  })
})
