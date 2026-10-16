import { describe, expect, it } from 'vitest'
import { fingerprint, stableStringify } from './aiFingerprint'

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1', pedido: 1042, estado: 'EN_PREPARACION', prioritario: false, minutos_desde_creado: 9, minutos_en_estado: 4,
  umbral_sla_min: 20, atrasado: false, detenido: false,
  platos: [{ plato: 'Corrientazo', cantidad: 2, estado: 'EN_PREPARACION', minutos_en_estado: 4, detenido: false, con_observacion: false }],
  ...over,
})

describe('the fingerprint of an AI analysis (ADR 0063)', () => {
  it('sorted keys: the same data in another order is the same text', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(stableStringify({ a: [2, { c: 2, d: 1 }], b: 1 }))
  })

  it('kitchen: minutes passing do not change it; a late order, a new order or a new state do', async () => {
    const base = await fingerprint('kitchen_insights', { contexto: { domiciliarios_activos: 2 }, pedidos: [order()] })
    expect(await fingerprint('kitchen_insights', { contexto: { domiciliarios_activos: 2 }, pedidos: [order({ minutos_desde_creado: 13, minutos_en_estado: 8 })] })).toBe(base)
    expect(await fingerprint('kitchen_insights', { contexto: { domiciliarios_activos: 2 }, pedidos: [order({ atrasado: true })] })).not.toBe(base)
    expect(await fingerprint('kitchen_insights', { contexto: { domiciliarios_activos: 2 }, pedidos: [order(), order({ id: 'o2' })] })).not.toBe(base)
    expect(await fingerprint('kitchen_insights', { contexto: { domiciliarios_activos: 2 }, pedidos: [order({ estado: 'LISTO' })] })).not.toBe(base)
    expect(await fingerprint('kitchen_insights', { contexto: { domiciliarios_activos: 1 }, pedidos: [order()] })).not.toBe(base)
  })

  it('supply: a few grams more or less do not change it; a real change does', async () => {
    const row = { id: 'i1', nombre: 'Arroz', stock_disponible: 1200.4, cobertura_dias: 3.2 }
    const base = await fingerprint('supply_reorder', { insumos: [row] })
    expect(await fingerprint('supply_reorder', { insumos: [{ ...row, stock_disponible: 1200.2 }] })).toBe(base)
    expect(await fingerprint('supply_reorder', { insumos: [{ ...row, stock_disponible: 800 }] })).not.toBe(base)
    expect(await fingerprint('supply_perishables', { insumos: [row] })).not.toBe(base)
  })
})
