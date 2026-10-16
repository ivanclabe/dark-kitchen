import { describe, expect, it } from 'vitest'
// El esquema de parámetros de la base, como texto (Vite ?raw).
import schemaSql from '../../../../supabase/migrations/20260928100000_dk_ai_quota_and_settings_schema.sql?raw'
// ADR 0063: later changes of the schema (the kitchen frequency, Copilot, invoices and the AI budget).
import costControlSql from '../../../../supabase/migrations/20261015130000_dk_ai_cost_control.sql?raw'
// ADR 0063 (D4–D6): the cost rules.
import costRulesSql from '../../../../supabase/migrations/20261015140000_dk_cost_controls.sql?raw'
import { EXTRA_FIELDS } from '@/modules/organization/lib/featureSettingFields'
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
  type Rule = { type: string; min?: number; max?: number }
  const schemas: Record<string, Record<string, Rule>> = Object.fromEntries(
    [...schemaSql.matchAll(/when '([a-z_]+)' then '(\{.*\})'/g)].map((m) => [m[1], JSON.parse(m[2]) as Record<string, Rule>]),
  )
  // The later migration: whole schemas set for a feature, and the kitchen frequency's new minimum.
  for (const m of costControlSql.matchAll(/settings_schema = '(\{[^']*\})'\s*where key = '([a-z_]+)'/g)) schemas[m[2]] = JSON.parse(m[1])
  const budget = costControlSql.match(/'ai_budget'[\s\S]*?'(\{"monthly_runs": \{[^']*\})'/)
  if (budget) schemas.ai_budget = JSON.parse(budget[1])
  const costRules = costRulesSql.match(/'cost_controls'[\s\S]*?'(\{"target_food_cost_pct": \{[^']*\})'/)
  if (costRules) schemas.cost_controls = JSON.parse(costRules[1])
  if (/jsonb_set\(settings_schema, '\{frequency_min,min\}', '5'\)\s*where key = 'kitchen_insights'/.test(costControlSql)) schemas.kitchen_insights.frequency_min.min = 5

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

  it('los ajustes de Copilot, facturas, presupuesto y costos (ADR 0063) también coinciden con la base', () => {
    for (const [key, fields] of Object.entries(EXTRA_FIELDS)) {
      const schema = schemas[key]
      expect(schema, key).toBeDefined()
      expect(Object.keys(schema).sort(), key).toEqual(fields!.map((f) => f.key).sort())
      for (const field of fields!) {
        expect(schema[field.key].type, `${key}.${field.key}`).toBe(field.type)
        if (field.type === 'number') {
          expect(schema[field.key].min, `${key}.${field.key} min`).toBe(field.min)
          expect(schema[field.key].max, `${key}.${field.key} max`).toBe(field.max)
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
