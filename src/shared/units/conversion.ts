/**
 * ADR 0056 — automatic unit conversion, the same rule as the database
 * (dk_unit_factor): how many base units of an ingredient one unit holds.
 *   same unit → 1 · the ingredient's own package → its factor ·
 *   same kind (kg↔g, l↔ml, docena↔unidad) → ratio · generic packages (caja,
 *   bolsa, paquete) only with the ingredient's own factor · else no conversion.
 * The base unit is the truth: stock, cost and consumption stay in it.
 */
import type { Unit } from '@/shared/api/units'

/** Units that hold an unknown amount: the person says how much they bring. */
export const PACKAGING_UNITS = ['caja', 'bolsa', 'paquete']

/** ADR 0057: «1 porción = 150 g» of a preparation — like a package, only with the ingredient's own factor. Never bought. */
export const PORTION_UNIT = 'porcion'

/** ADR 0069: what an ingredient can be counted in (g, kg, ml, l, unidad…) — not a package or a portion, as dk_create_ingredient checks. */
export function canBeBaseUnit(code: string): boolean {
  return !PACKAGING_UNITS.includes(code) && code !== PORTION_UNIT
}

/** How a unit reads on screen: «porcion» → «porción» / «porciones». */
export function unitLabel(code: string, quantity = 1): string {
  if (code === PORTION_UNIT) return Math.abs(quantity) === 1 ? 'porción' : 'porciones'
  return code
}

export interface IngredientUnitInfo {
  baseUnitCode: string
  baseUnitType: Unit['unitType']
  purchaseUnits: { unitCode: string; factor: number }[]
}

/** Base units in one `unitCode` for this ingredient, or null when there is no conversion. */
export function unitFactor(unitCode: string | null, info: IngredientUnitInfo | null, units: Unit[]): number | null {
  if (!unitCode || !info) return null
  if (unitCode === info.baseUnitCode) return 1
  const own = info.purchaseUnits.find((p) => p.unitCode === unitCode)
  if (own) return own.factor
  const unit = units.find((u) => u.code === unitCode)
  const base = units.find((u) => u.code === info.baseUnitCode)
  if (!unit || !base || unit.unitType !== base.unitType || [...PACKAGING_UNITS, PORTION_UNIT].includes(unit.code) || [...PACKAGING_UNITS, PORTION_UNIT].includes(base.code)) return null
  return unit.factorToBase / base.factorToBase
}

/** The units that convert for this ingredient: its base first, then the rest from small to large. */
export function compatibleUnits(info: IngredientUnitInfo | null, units: Unit[]): Unit[] {
  if (!info) return []
  return units
    .filter((u) => unitFactor(u.code, info, units) !== null)
    .sort((a, b) => (a.code === info.baseUnitCode ? -1 : b.code === info.baseUnitCode ? 1 : (unitFactor(a.code, info, units) ?? 0) - (unitFactor(b.code, info, units) ?? 0)))
}

/** A quantity typed in `unitCode` → the ingredient's base unit (null when it does not convert). */
export function toBase(quantity: number, unitCode: string | null, info: IngredientUnitInfo | null, units: Unit[]): number | null {
  const factor = unitFactor(unitCode, info, units)
  return factor === null ? null : quantity * factor
}

const NUMBER = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 })

/** 1234.5 → «1.234,5» (up to 3 decimals, never trailing zeros). */
export function formatNumber(n: number): string {
  return NUMBER.format(Math.round(n * 1000) / 1000)
}

/**
 * A quantity in a base unit, written the way people read it:
 * 12500 g → «12,5 kg», 0.005 kg → «5 g», 1500 ml → «1,5 l», 24 unidad → «24 unidades».
 * Only the display changes; the stored number is the same.
 */
export function formatQuantity(quantity: number, baseUnitCode: string): string {
  const abs = Math.abs(quantity)
  if (baseUnitCode === 'g' && abs >= 1000) return `${formatNumber(quantity / 1000)} kg`
  if (baseUnitCode === 'ml' && abs >= 1000) return `${formatNumber(quantity / 1000)} l`
  if (baseUnitCode === 'kg' && abs > 0 && abs < 1) return `${formatNumber(quantity * 1000)} g`
  if (baseUnitCode === 'l' && abs > 0 && abs < 1) return `${formatNumber(quantity * 1000)} ml`
  if (baseUnitCode === 'unidad') return `${formatNumber(quantity)} ${abs === 1 ? 'unidad' : 'unidades'}`
  return `${formatNumber(quantity)} ${baseUnitCode}`
}

/** «2 kg = 2.000 g» — what a conversion means, for the screen (null when nothing to explain). */
export function equivalence(quantity: number, unitCode: string | null, info: IngredientUnitInfo | null, units: Unit[]): string | null {
  if (!info || !unitCode || unitCode === info.baseUnitCode || !(quantity > 0)) return null
  const base = toBase(quantity, unitCode, info, units)
  return base === null ? null : `${formatNumber(quantity)} ${unitLabel(unitCode, quantity)} = ${formatNumber(base)} ${info.baseUnitCode}`
}
