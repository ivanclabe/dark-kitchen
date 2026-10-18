import { describe, expect, it } from 'vitest'
import type { Unit } from '@/shared/api/units'
import { compatibleUnits, equivalence, formatNumber, formatQuantity, toBase, unitFactor, type IngredientUnitInfo, canBeBaseUnit } from './conversion'

// ADR 0056: the same rule as dk_unit_factor (the cases of supabase/tests/unit_conversion.sql).
const units: Unit[] = [
  { id: 'g', code: 'g', name: 'Gramo', unitType: 'WEIGHT', factorToBase: 1 },
  { id: 'kg', code: 'kg', name: 'Kilogramo', unitType: 'WEIGHT', factorToBase: 1000 },
  { id: 'ml', code: 'ml', name: 'Mililitro', unitType: 'VOLUME', factorToBase: 1 },
  { id: 'l', code: 'l', name: 'Litro', unitType: 'VOLUME', factorToBase: 1000 },
  { id: 'un', code: 'unidad', name: 'Unidad', unitType: 'UNIT', factorToBase: 1 },
  { id: 'doc', code: 'docena', name: 'Docena', unitType: 'UNIT', factorToBase: 12 },
  { id: 'caja', code: 'caja', name: 'Caja', unitType: 'UNIT', factorToBase: 1 },
  { id: 'bolsa', code: 'bolsa', name: 'Bolsa', unitType: 'UNIT', factorToBase: 1 },
]
const meat: IngredientUnitInfo = { baseUnitCode: 'g', baseUnitType: 'WEIGHT', purchaseUnits: [] }
const salt: IngredientUnitInfo = { baseUnitCode: 'kg', baseUnitType: 'WEIGHT', purchaseUnits: [] }
const milk: IngredientUnitInfo = { baseUnitCode: 'ml', baseUnitType: 'VOLUME', purchaseUnits: [] }
const egg: IngredientUnitInfo = { baseUnitCode: 'unidad', baseUnitType: 'UNIT', purchaseUnits: [{ unitCode: 'caja', factor: 12 }] }

describe('unit conversion (ADR 0056)', () => {
  it('converts as the database does', () => {
    expect([unitFactor('kg', meat, units), unitFactor('g', meat, units), unitFactor('l', meat, units), unitFactor('unidad', meat, units)]).toEqual([1000, 1, null, null])
    expect([unitFactor('g', salt, units), unitFactor('l', milk, units), unitFactor('docena', egg, units)]).toEqual([0.001, 1000, 12])
    expect(unitFactor('caja', egg, units)).toBe(12)
    expect(unitFactor('caja', { ...egg, purchaseUnits: [] }, units)).toBeNull()
    expect(unitFactor('bolsa', egg, units)).toBeNull()
  })

  it('offers only the units that convert, the base first', () => {
    expect(compatibleUnits(meat, units).map((u) => u.code)).toEqual(['g', 'kg'])
    expect(compatibleUnits(salt, units).map((u) => u.code)).toEqual(['kg', 'g'])
    expect(compatibleUnits(egg, units).map((u) => u.code)).toEqual(['unidad', 'docena', 'caja'])
    expect(compatibleUnits(null, units)).toEqual([])
  })

  it('the whole chain in numbers: 2 kg → 2000 g; 150 g of salt kept in kg → 0,15 kg; 0,1 kg of waste → 100 g', () => {
    expect(toBase(2, 'kg', meat, units)).toBe(2000)
    expect(toBase(150, 'g', salt, units)).toBeCloseTo(0.15)
    expect(toBase(0.1, 'kg', meat, units)).toBeCloseTo(100)
    expect(toBase(1, 'l', meat, units)).toBeNull()
    expect(equivalence(2, 'kg', meat, units)).toBe('2 kg = 2.000 g')
    expect(equivalence(5, 'g', salt, units)).toBe('5 g = 0,005 kg')
    expect(equivalence(150, 'g', meat, units)).toBeNull()
  })

  it('shows quantities as people read them (the stored number does not change)', () => {
    expect(formatQuantity(12500, 'g')).toBe('12,5 kg')
    expect(formatQuantity(750, 'g')).toBe('750 g')
    expect(formatQuantity(0.005, 'kg')).toBe('5 g')
    expect(formatQuantity(1.25, 'kg')).toBe('1,25 kg')
    expect(formatQuantity(1500, 'ml')).toBe('1,5 l')
    expect(formatQuantity(24, 'unidad')).toBe('24 unidades')
    expect(formatQuantity(1, 'unidad')).toBe('1 unidad')
    expect(formatQuantity(-2500, 'g')).toBe('-2,5 kg')
    expect(formatNumber(1234.5678)).toBe('1.234,568')
  })
})

describe('canBeBaseUnit (ADR 0069)', () => {
  it('weights, volumes and units are; packages and portions are not', () => {
    expect(['g', 'kg', 'ml', 'l', 'unidad', 'docena'].every(canBeBaseUnit)).toBe(true)
    expect(['caja', 'bolsa', 'paquete', 'porcion'].some(canBeBaseUnit)).toBe(false)
  })
})
