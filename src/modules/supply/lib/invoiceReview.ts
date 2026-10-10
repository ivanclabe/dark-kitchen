/**
 * ADR 0049 — the rules of the review screen, as pure functions: which unit the
 * invoice means, which units make sense for an ingredient, what is still
 * missing in a line, what looks odd, and whether the lines add up to the
 * invoice. Nothing here decides for the person: it only proposes and warns.
 */
import type { Unit } from '@/shared/api/units'
import type { Extraction, IngredientSuggestion, InvoiceMatch, ReviewDraft, ReviewLine, SupplierChoice } from '../types/invoiceImport'

/** Units that hold an unknown amount: the person says how much they bring. */
export const PACKAGING_UNITS = ['caja', 'bolsa', 'paquete']

/** A suggestion this sure is chosen for the person (still visible and changeable). */
export const AUTO_PICK_SCORE = 0.9

/** Price per base unit more than this many times off the usual one: warn. */
export const PRICE_JUMP = 3

const UNIT_WORDS: Record<string, string> = {
  kg: 'kg', kgs: 'kg', k: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg',
  g: 'g', gr: 'g', grs: 'g', grm: 'g', gramo: 'g', gramos: 'g',
  l: 'l', lt: 'l', lts: 'l', ltr: 'l', litro: 'l', litros: 'l',
  ml: 'ml', cc: 'ml', mililitro: 'ml', mililitros: 'ml',
  und: 'unidad', un: 'unidad', u: 'unidad', ud: 'unidad', uds: 'unidad', unid: 'unidad', unidad: 'unidad', unidades: 'unidad',
  pza: 'unidad', pieza: 'unidad', piezas: 'unidad',
  doc: 'docena', dz: 'docena', docena: 'docena', docenas: 'docena',
  caja: 'caja', cajas: 'caja', cj: 'caja', cja: 'caja',
  bolsa: 'bolsa', bolsas: 'bolsa', bls: 'bolsa',
  paquete: 'paquete', paquetes: 'paquete', paq: 'paquete', pq: 'paquete', pqt: 'paquete',
}

export function foldText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** «KG», «Und.», «CAJA X 12», «kilos» → the unit code, or null when unknown (lb, «bulto»…). */
export function parseUnitText(text: string | null | undefined): string | null {
  if (!text) return null
  const first = foldText(text).replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/)[0]
  return first ? (UNIT_WORDS[first] ?? null) : null
}

/** The base unit a new ingredient should have, from how the invoice sells it. */
export function baseUnitFor(unitCode: string | null, units: Unit[]): string {
  const unit = units.find((u) => u.code === unitCode)
  if (!unit || PACKAGING_UNITS.includes(unit.code)) return 'unidad'
  return unit.unitType === 'WEIGHT' ? 'g' : unit.unitType === 'VOLUME' ? 'ml' : 'unidad'
}

export interface IngredientUnitInfo {
  baseUnitCode: string
  baseUnitType: Unit['unitType']
  purchaseUnits: { unitCode: string; factor: number }[]
}

/** Units that make sense to buy an ingredient in: its type, its own purchase units and packages. */
export function unitsFor(info: IngredientUnitInfo | null, units: Unit[]): Unit[] {
  if (!info) return units
  const own = new Set(info.purchaseUnits.map((p) => p.unitCode))
  return units.filter((u) => u.unitType === info.baseUnitType || own.has(u.code) || PACKAGING_UNITS.includes(u.code))
}

/** Base units in one purchase unit, when it is known without asking. */
export function knownFactor(unitCode: string | null, info: IngredientUnitInfo | null, units: Unit[]): number | null {
  if (!unitCode || !info) return null
  if (unitCode === info.baseUnitCode) return 1
  const own = info.purchaseUnits.find((p) => p.unitCode === unitCode)
  if (own) return own.factor
  const unit = units.find((u) => u.code === unitCode)
  const base = units.find((u) => u.code === info.baseUnitCode)
  if (!unit || !base || unit.unitType !== base.unitType || PACKAGING_UNITS.includes(unit.code)) return null
  return unit.factorToBase / base.factorToBase
}

/** The unit needs the person to say how much it brings («¿Cuántos g trae la caja?»). */
export function needsFactor(unitCode: string | null, info: IngredientUnitInfo | null, units: Unit[]): boolean {
  return Boolean(unitCode && info && knownFactor(unitCode, info, units) === null)
}

/** What the review knows about the unit of the ingredient chosen in a line. */
export function lineUnitInfo(line: ReviewLine, units: Unit[], ingredients: IngredientUnitInfoById): IngredientUnitInfo | null {
  if (!line.ingredient) return null
  if (line.ingredient.kind === 'new') {
    const base = units.find((u) => u.code === (line.ingredient as { baseUnitCode: string }).baseUnitCode)
    return base ? { baseUnitCode: base.code, baseUnitType: base.unitType, purchaseUnits: [] } : null
  }
  return ingredients.get(line.ingredient.id) ?? null
}

export type IngredientUnitInfoById = Map<string, IngredientUnitInfo & { avgCost: number; name: string }>

/** What blocks saving a line (empty when it is ready). Ignored lines never block. */
export function lineProblems(line: ReviewLine, units: Unit[], ingredients: IngredientUnitInfoById): string[] {
  if (line.ignored) return []
  const problems: string[] = []
  const info = lineUnitInfo(line, units, ingredients)
  if (!line.ingredient) problems.push('Elige el insumo, créalo o ignora la línea')
  else if (line.ingredient.kind === 'new' && !line.ingredient.name.trim()) problems.push('Escribe el nombre del insumo nuevo')
  if (!(line.quantity && line.quantity > 0)) problems.push('Escribe la cantidad')
  if (!line.unitCode) problems.push('Elige la unidad')
  if (line.unitCost === null || line.unitCost < 0) problems.push('Escribe el costo')
  if (line.ingredient && needsFactor(line.unitCode, info, units) && !(line.factor && line.factor > 0)) {
    problems.push(`Indica cuántos ${info?.baseUnitCode ?? ''} trae 1 ${line.unitCode}`.replace(/\s+/g, ' '))
  }
  return problems
}

/** Odd things worth a second look (they never block). */
export function lineWarnings(line: ReviewLine, units: Unit[], ingredients: IngredientUnitInfoById): string[] {
  if (line.ignored) return []
  const warnings: string[] = []
  if (line.confidence !== 'alta') warnings.push(line.confidence === 'baja' ? 'Se leyó con dudas' : 'Revisa: lectura poco clara')
  if (line.quantity && line.unitCost !== null && line.invoiceLineTotal !== null) {
    const total = line.quantity * line.unitCost
    if (Math.abs(total - line.invoiceLineTotal) > Math.max(1, line.invoiceLineTotal * 0.01)) warnings.push('Cantidad × costo no da el total de la línea en la factura')
  }
  if (line.ingredient?.kind === 'existing' && line.unitCost !== null && line.unitCost > 0) {
    const info = ingredients.get(line.ingredient.id)
    const factor = knownFactor(line.unitCode, info ?? null, units) ?? line.factor
    if (info && info.avgCost > 0 && factor && factor > 0) {
      const ratio = line.unitCost / factor / info.avgCost
      if (ratio > PRICE_JUMP) warnings.push(`Cuesta ${Math.round(ratio)} veces más que el costo promedio de ${info.name}`)
      else if (ratio < 1 / PRICE_JUMP) warnings.push(`Cuesta mucho menos que el costo promedio de ${info.name}`)
    }
  }
  return warnings
}

export function lineTotal(line: ReviewLine): number {
  return line.ignored || !line.quantity || line.unitCost === null ? 0 : line.quantity * line.unitCost
}

/** The lines against the invoice subtotal (or total − tax). */
export function reconcile(lines: ReviewLine[], invoice: Pick<Extraction['invoice'], 'subtotal' | 'total' | 'tax'>) {
  const linesTotal = lines.reduce((sum, l) => sum + lineTotal(l), 0)
  const expected = invoice.subtotal ?? (invoice.total !== null ? invoice.total - (invoice.tax ?? 0) : null)
  if (expected === null || expected <= 0) return { linesTotal, expected: null, difference: null, ok: true }
  const difference = linesTotal - expected
  return { linesTotal, expected, difference, ok: Math.abs(difference) <= Math.max(1, expected * 0.01) }
}

function pickedSuggestion(suggestions: IngredientSuggestion[]): IngredientSuggestion | null {
  const top = suggestions[0]
  return top && top.score >= AUTO_PICK_SCORE ? top : null
}

/** The first draft from what the AI read and what the database matched. */
export function initialDraft(extraction: Extraction, match: InvoiceMatch, units: Unit[]): ReviewDraft {
  const supplier: SupplierChoice | null = match.supplierId
    ? { kind: 'existing', id: match.supplierId }
    : null
  const lines: ReviewLine[] = extraction.lines.map((l, index) => {
    const suggestions = match.lines.find((m) => m.index === index)?.suggestions ?? []
    const picked = pickedSuggestion(suggestions)
    const parsed = parseUnitText(l.unit)
    let unitCode: string | null = picked?.learnedUnitCode ?? (parsed && units.some((u) => u.code === parsed) ? parsed : null)
    if (picked && !unitCode) unitCode = picked.baseUnitCode
    const own = picked?.purchaseUnits.find((p) => p.unitCode === unitCode)
    return {
      key: `${index}`,
      index,
      text: l.text,
      code: l.code,
      ignored: false,
      ingredient: picked ? { kind: 'existing', id: picked.ingredientId } : null,
      quantity: l.quantity,
      unitCode,
      unitCost: l.unitPrice,
      factor: own?.factor ?? null,
      remember: true,
      confidence: l.confidence,
      invoiceLineTotal: l.lineTotal,
      suggestions,
    }
  })
  return {
    supplier,
    invoiceNumber: extraction.invoice.number ?? '',
    invoiceDate: extraction.invoice.date ?? '',
    tax: extraction.invoice.tax,
    notes: '',
    lines,
  }
}

/** A new supplier, prefilled with what the invoice says. */
export function supplierFromExtraction(extraction: Extraction): SupplierChoice {
  const s = extraction.supplier
  return { kind: 'new', name: s.name ?? '', taxId: s.taxId ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '' }
}

/** What blocks saving the whole purchase. */
export function draftProblems(draft: ReviewDraft, units: Unit[], ingredients: IngredientUnitInfoById): string[] {
  const problems: string[] = []
  if (!draft.supplier) problems.push('Elige o crea el proveedor')
  else if (draft.supplier.kind === 'new' && !draft.supplier.name.trim()) problems.push('Escribe el nombre del proveedor')
  if (!draft.invoiceNumber.trim()) problems.push('Escribe el número de la factura')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.invoiceDate)) problems.push('Escribe la fecha de la factura')
  if (draft.tax !== null && draft.tax < 0) problems.push('El IVA no puede ser negativo')
  const included = draft.lines.filter((l) => !l.ignored)
  if (included.length === 0) problems.push('Deja al menos una línea con insumo')
  const pending = included.filter((l) => lineProblems(l, units, ingredients).length > 0).length
  if (pending) problems.push(pending === 1 ? 'Falta completar 1 línea' : `Faltan completar ${pending} líneas`)
  return problems
}

/** The payload of dk_create_purchase_from_import. */
export function toPayload(draft: ReviewDraft, units: Unit[], ingredients: IngredientUnitInfoById) {
  const supplier = draft.supplier!
  return {
    supplier:
      supplier.kind === 'existing'
        ? { id: supplier.id }
        : {
            create: {
              name: supplier.name.trim(),
              taxId: supplier.taxId.trim() || null,
              phone: supplier.phone.trim() || null,
              email: supplier.email.trim() || null,
              address: supplier.address.trim() || null,
            },
          },
    invoice: { number: draft.invoiceNumber.trim(), date: draft.invoiceDate, tax: draft.tax ?? 0, notes: draft.notes.trim() || null },
    lines: draft.lines
      .filter((l) => !l.ignored)
      .map((l) => {
        const info = lineUnitInfo(l, units, ingredients)
        return {
          text: l.text,
          ingredient: l.ingredient!.kind === 'existing' ? { id: l.ingredient!.id } : { create: { name: l.ingredient!.name.trim(), baseUnitCode: l.ingredient!.baseUnitCode } },
          quantity: l.quantity,
          unitCode: l.unitCode,
          unitCost: l.unitCost,
          factor: needsFactor(l.unitCode, info, units) ? l.factor : null,
          remember: l.remember,
        }
      }),
  }
}

/** «Mismo NIT», «Lo asociaste antes»… — why something was suggested. */
export function reasonLabel(reason: string, score: number): string {
  switch (reason) {
    case 'tax_id':
      return 'Mismo NIT'
    case 'name':
      return 'Mismo nombre'
    case 'learned':
      return score >= 1 ? 'Lo asociaste antes' : 'Asociado con otro proveedor'
    case 'code':
      return 'Mismo código'
    default:
      return `Parecido ${Math.round(score * 100)} %`
  }
}
