import { describe, expect, it } from 'vitest'
import { AI_FEATURES, featureDefinition, settingError, withDefaults } from './catalog'

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
