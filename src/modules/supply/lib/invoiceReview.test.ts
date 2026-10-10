import { describe, expect, it } from 'vitest'
import type { Unit } from '@/shared/api/units'
import type { Extraction, IngredientSuggestion, InvoiceMatch, ReviewLine } from '../types/invoiceImport'
import {
  baseUnitFor,
  draftProblems,
  emptyLine,
  packFactor,
  proposedReference,
  initialDraft,
  knownFactor,
  lineProblems,
  lineWarnings,
  needsFactor,
  parseUnitText,
  reasonLabel,
  reconcile,
  toPayload,
  unitsFor,
  type IngredientUnitInfoById,
} from './invoiceReview'

const units: Unit[] = [
  { id: 'u-g', code: 'g', name: 'Gramo', unitType: 'WEIGHT', factorToBase: 1 },
  { id: 'u-kg', code: 'kg', name: 'Kilogramo', unitType: 'WEIGHT', factorToBase: 1000 },
  { id: 'u-ml', code: 'ml', name: 'Mililitro', unitType: 'VOLUME', factorToBase: 1 },
  { id: 'u-l', code: 'l', name: 'Litro', unitType: 'VOLUME', factorToBase: 1000 },
  { id: 'u-un', code: 'unidad', name: 'Unidad', unitType: 'UNIT', factorToBase: 1 },
  { id: 'u-doc', code: 'docena', name: 'Docena', unitType: 'UNIT', factorToBase: 12 },
  { id: 'u-caja', code: 'caja', name: 'Caja', unitType: 'UNIT', factorToBase: 1 },
]

const tomato: IngredientSuggestion = {
  ingredientId: 'tom', name: 'Tomate', code: 'TOM', active: true, baseUnitCode: 'g', baseUnitType: 'WEIGHT', avgCost: 4,
  purchaseUnits: [], score: 1, reason: 'learned', learnedUnitCode: 'kg',
}
const egg: IngredientSuggestion = { ...tomato, ingredientId: 'egg', name: 'Huevo', code: 'HUEVO', baseUnitCode: 'unidad', baseUnitType: 'UNIT', avgCost: 500, score: 0.6, reason: 'similar', learnedUnitCode: null }

const ingredients: IngredientUnitInfoById = new Map([
  ['tom', { baseUnitCode: 'g', baseUnitType: 'WEIGHT', purchaseUnits: [], avgCost: 4, name: 'Tomate' }],
  ['egg', { baseUnitCode: 'unidad', baseUnitType: 'UNIT', purchaseUnits: [{ unitCode: 'caja', factor: 30 }], avgCost: 500, name: 'Huevo' }],
])

const extraction: Extraction = {
  isInvoice: true,
  supplier: { name: 'Frutas El Sol', taxId: '900123456-7', phone: null, email: null, address: null },
  invoice: { number: 'FE-1', date: '2026-10-09', currency: 'COP', subtotal: 23000, tax: 0, total: 23000 },
  confidence: { supplier: 'alta', number: 'alta', date: 'alta', totals: 'alta' },
  lines: [
    { text: 'TOMATE CHONTO X KG', code: null, quantity: 2, unit: 'KG', unitPrice: 4000, lineTotal: 8000, confidence: 'alta' },
    { text: 'Huevos AA', code: null, quantity: 30, unit: 'Und.', unitPrice: 500, lineTotal: 15000, confidence: 'media' },
  ],
  warnings: [],
}
const match: InvoiceMatch = {
  suppliers: [],
  supplierId: 'sup',
  supplierStrong: true,
  duplicateInvoice: null,
  lines: [
    { index: 0, suggestions: [tomato] },
    { index: 1, suggestions: [egg] },
  ],
}

function line(patch: Partial<ReviewLine>): ReviewLine {
  return {
    key: '0', index: 0, text: 'x', code: null, ignored: false, ingredient: { kind: 'existing', id: 'tom' }, quantity: 1, unitCode: 'g', unitCost: 4,
    factor: null, remember: true, confidence: 'alta', invoiceLineTotal: null, suggestions: [], genericName: null, pack: null, ...patch,
  }
}

describe('units', () => {
  it('reads how invoices write units', () => {
    expect(parseUnitText('KG')).toBe('kg')
    expect(parseUnitText('Und.')).toBe('unidad')
    expect(parseUnitText('CAJA X 12')).toBe('caja')
    expect(parseUnitText('Litros')).toBe('l')
    expect(parseUnitText('lb')).toBeNull()
    expect(parseUnitText(null)).toBeNull()
  })

  it('a new ingredient gets the base unit of how it is sold', () => {
    expect(baseUnitFor('kg', units)).toBe('g')
    expect(baseUnitFor('l', units)).toBe('ml')
    expect(baseUnitFor('caja', units)).toBe('unidad')
    expect(baseUnitFor(null, units)).toBe('unidad')
  })

  it('only the units that make sense for the ingredient', () => {
    const codes = unitsFor(ingredients.get('tom')!, units).map((u) => u.code)
    // «unidad»: a closed package bought by the unit (then it asks how much it brings).
    expect(codes).toEqual(['g', 'kg', 'unidad', 'caja'])
  })

  it('a box asks how much it brings unless the ingredient already says', () => {
    expect(knownFactor('kg', ingredients.get('tom')!, units)).toBe(1000)
    expect(needsFactor('caja', ingredients.get('tom')!, units)).toBe(true)
    expect(needsFactor('caja', ingredients.get('egg')!, units)).toBe(false)
    expect(needsFactor('l', ingredients.get('tom')!, units)).toBe(true)
  })
})

describe('the first draft', () => {
  it('picks what is sure, leaves the doubtful for the person', () => {
    const draft = initialDraft(extraction, match, units)
    expect(draft.supplier).toEqual({ kind: 'existing', id: 'sup' })
    expect(draft.lines[0]).toMatchObject({ ingredient: { kind: 'existing', id: 'tom' }, unitCode: 'kg', quantity: 2, unitCost: 4000 })
    // 60 % alike: suggested, not chosen.
    expect(draft.lines[1]).toMatchObject({ ingredient: null, unitCode: 'unidad' })
    expect(draftProblems(draft, units, ingredients)).toEqual(['Falta completar 1 línea'])
  })

  it('without a sure supplier, the person chooses', () => {
    const draft = initialDraft(extraction, { ...match, supplierId: null }, units)
    expect(draftProblems(draft, units, ingredients)).toContain('Elige o crea el proveedor')
  })
})

describe('a line', () => {
  it('says what is missing', () => {
    expect(lineProblems(line({ ingredient: null }), units, ingredients)).toEqual(['Elige el insumo, créalo o ignora la línea'])
    expect(lineProblems(line({ unitCode: 'caja' }), units, ingredients)).toEqual(['Indica cuántos g trae 1 caja'])
    expect(lineProblems(line({ unitCode: 'caja', factor: 12000 }), units, ingredients)).toEqual([])
    expect(lineProblems(line({ ingredient: null, ignored: true }), units, ingredients)).toEqual([])
  })

  it('warns about a price far from the usual one and a total that does not add up', () => {
    expect(lineWarnings(line({ unitCode: 'kg', unitCost: 40000 }), units, ingredients)).toEqual(['Cuesta 10 veces más que el costo promedio de Tomate'])
    expect(lineWarnings(line({ unitCode: 'kg', unitCost: 4000, quantity: 2, invoiceLineTotal: 9000 }), units, ingredients)).toEqual([
      'Cantidad × costo no da el total de la línea en la factura',
    ])
    expect(lineWarnings(line({ confidence: 'baja' }), units, ingredients)).toEqual(['Se leyó con dudas'])
  })
})

describe('the totals', () => {
  it('the lines add up to the invoice (1 % tolerance); ignored lines do not count', () => {
    const lines = [line({ quantity: 2, unitCost: 4000 }), line({ quantity: 30, unitCost: 500 }), line({ quantity: 1, unitCost: 3000, ignored: true })]
    expect(reconcile(lines, { subtotal: 23000, total: 23000, tax: 0 })).toMatchObject({ linesTotal: 23000, ok: true })
    expect(reconcile(lines, { subtotal: null, total: 30000, tax: 2000 })).toMatchObject({ expected: 28000, difference: -5000, ok: false })
    expect(reconcile(lines, { subtotal: null, total: null, tax: null }).ok).toBe(true)
  })
})

describe('saving', () => {
  it('sends only the included lines, with the factor only when it is needed', () => {
    const draft = initialDraft(extraction, match, units)
    draft.lines[1] = { ...draft.lines[1], ingredient: { kind: 'new', name: ' Huevo AA ', baseUnitCode: 'unidad' } }
    draft.lines.push(line({ key: '2', text: 'Domicilio', ingredient: null, ignored: true }))
    draft.lines.push(line({ key: '3', text: 'Tomate caja', unitCode: 'caja', factor: 12000 }))
    const payload = toPayload({ ...draft, supplier: { kind: 'new', name: 'Frutas', taxId: ' 900 ', phone: '', email: '', address: '' } }, units, ingredients)
    expect(payload.supplier).toEqual({ create: { name: 'Frutas', taxId: '900', phone: null, email: null, address: null } })
    expect(payload.lines).toHaveLength(3)
    expect(payload.lines[1].ingredient).toEqual({ create: { name: 'Huevo AA', baseUnitCode: 'unidad' } })
    expect(payload.lines[0].factor).toBeNull()
    expect(payload.lines[2].factor).toBe(12000)
  })

  it('explains each suggestion', () => {
    expect(reasonLabel('tax_id', 1)).toBe('Mismo NIT')
    expect(reasonLabel('learned', 1)).toBe('Lo asociaste antes')
    expect(reasonLabel('similar', 0.82)).toBe('Parecido 82 %')
  })
})

describe('tickets (rev. 2)', () => {
  const rice: IngredientSuggestion = { ...tomato, ingredientId: 'rice', name: 'Arroz', code: 'ARROZ', score: 0.95, reason: 'name', learnedUnitCode: null }
  const ticket: Extraction = {
    ...extraction,
    documentType: 'pedido',
    invoice: { number: null, date: '2026-10-10', time: '06:11', currency: 'COP', subtotal: null, tax: null, total: 68900 },
    lines: [{ text: 'ARROZ SABROSON X 1000', genericName: 'Arroz', code: '11384', quantity: 6, unit: null, unitCode: 'unidad', packSize: 1000, packUnit: 'g', unitPrice: 3800, lineTotal: 22800, confidence: 'alta' }],
  }

  it('a document without number gets a reference to edit', () => {
    expect(proposedReference({ date: '2026-10-10', time: '06:11', total: 68900 })).toBe('SN-20261010-0611')
    expect(proposedReference({ date: '2026-10-10', time: null, total: 68900 })).toBe('SN-20261010-68900')
    const draft = initialDraft(ticket, { ...match, lines: [{ index: 0, suggestions: [rice] }] }, units)
    expect(draft).toMatchObject({ invoiceNumber: 'SN-20261010-0611', numberProposed: true })
  })

  it('«X 1000» bought by the unit: 1 unidad = 1000 g, already filled in', () => {
    const draft = initialDraft(ticket, { ...match, lines: [{ index: 0, suggestions: [rice] }] }, units)
    expect(draft.lines[0]).toMatchObject({ ingredient: { kind: 'existing', id: 'rice' }, unitCode: 'unidad', factor: 1000, genericName: 'Arroz', pack: { size: 1000, unitCode: 'g' } })
    const info = { baseUnitCode: 'g', baseUnitType: 'WEIGHT' as const, purchaseUnits: [], avgCost: 3, name: 'Arroz' }
    expect(lineProblems(draft.lines[0], units, new Map([['rice', info]]))).toEqual([])
    // A pack in ml does not fit an ingredient in grams.
    expect(packFactor({ pack: { size: 3000, unitCode: 'ml' }, unitCode: 'unidad' }, info, units)).toBeNull()
  })

  it('a line added by hand starts empty and is not learned', () => {
    expect(emptyLine('added-1')).toMatchObject({ added: true, remember: false, text: '', ingredient: null })
  })
})

