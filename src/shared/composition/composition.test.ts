import { describe, expect, it } from 'vitest'
import {
  choose,
  chosenOptions,
  chosenSummary,
  defaultSelection,
  groupRule,
  lineSignature,
  missingGroups,
  pricingLabel,
  toPayload,
  unitPrice,
  type OptionGroup,
  type Selection,
} from './composition'

// ADR 0059: the same cases as the SQL suite (dish_composition), on screen.
const groups: OptionGroup[] = [
  { id: 'sopa', name: 'Sopa', minSelect: 1, maxSelect: 1, allowRepeat: false, options: [{ id: 'sancocho', name: 'Sancocho', pricing: 'included', price: 0, isDefault: true }] },
  {
    id: 'prot', name: 'Proteína', minSelect: 1, maxSelect: 1, allowRepeat: false,
    options: [
      { id: 'pollo', name: 'Pollo', pricing: 'included', price: 0, isDefault: true },
      { id: 'res', name: 'Res', pricing: 'extra', price: 3000, isDefault: false },
    ],
  },
  { id: 'beb', name: 'Bebida', minSelect: 1, maxSelect: 1, allowRepeat: false, options: [{ id: 'limo', name: 'Limonada', pricing: 'included', price: 0, isDefault: false }] },
  {
    id: 'acomp', name: 'Acompañantes', minSelect: 0, maxSelect: 3, allowRepeat: true,
    options: [
      { id: 'pata', name: 'Patacones', pricing: 'extra', price: 2000, isDefault: false },
      { id: 'yuca', name: 'Yuca', pricing: 'courtesy', price: 0, isDefault: false },
      { id: 'taja', name: 'Tajadas', pricing: 'extra', price: 1500, isDefault: false, available: false },
    ],
  },
]
const money = (n: number) => `$${n.toLocaleString('es-CO')}`

describe('composition (ADR 0059)', () => {
  it('starts with the defaults; a required group without one is missing until chosen', () => {
    const sel = defaultSelection(groups)
    expect(sel).toEqual({ sancocho: 1, pollo: 1 })
    expect(missingGroups(groups, sel).map((g) => g.name)).toEqual(['Bebida'])
  })

  it('beef + lemonade + patacones ×2 + yuca: $18.000 + $3.000 + $4.000 = $25.000; yuca is on the house', () => {
    let sel = defaultSelection(groups)
    sel = choose(groups[1], sel, 'res')
    sel = choose(groups[2], sel, 'limo')
    sel = choose(groups[3], sel, 'pata')
    sel = choose(groups[3], sel, 'pata')
    sel = choose(groups[3], sel, 'yuca')
    expect(missingGroups(groups, sel)).toEqual([])
    expect(unitPrice(18000, groups, sel)).toBe(25000)
    expect(chosenSummary(chosenOptions(groups, sel))).toBe('Sancocho · Res · Limonada · Patacones ×2 · Yuca')
    expect(toPayload(sel)).toEqual([
      { optionId: 'limo', quantity: 1 },
      { optionId: 'pata', quantity: 2 },
      { optionId: 'res', quantity: 1 },
      { optionId: 'sancocho', quantity: 1 },
      { optionId: 'yuca', quantity: 1 },
    ])
  })

  it('never goes past a group limit, a radio replaces, a sold-out option cannot be chosen', () => {
    let sel: Selection = { pata: 2, yuca: 1 }
    sel = choose(groups[3], sel, 'pata')
    expect(sel).toEqual({ pata: 2, yuca: 1 })
    expect(choose(groups[3], sel, 'pata', -1)).toEqual({ pata: 1, yuca: 1 })
    expect(choose(groups[1], { pollo: 1 }, 'res')).toEqual({ res: 1 })
    expect(choose(groups[3], {}, 'taja')).toEqual({})
  })

  it('the same dish chosen the same way is one cart line; labels', () => {
    expect(lineSignature('p', [{ optionId: 'b', quantity: 1 }, { optionId: 'a', quantity: 2 }])).toBe(lineSignature('p', [{ optionId: 'a', quantity: 2 }, { optionId: 'b', quantity: 1 }]))
    expect(lineSignature('p', [])).toBe('p')
    expect(pricingLabel(groups[1].options[1], money)).toBe('+$3.000')
    expect(pricingLabel(groups[3].options[1], money)).toBe('Cortesía')
    expect(groupRule(groups[0])).toBe('Obligatorio · elige 1')
    expect(groupRule(groups[3])).toBe('Opcional · hasta 3')
  })
})
