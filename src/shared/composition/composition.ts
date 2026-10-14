/**
 * ADR 0059 — a configurable dish on screen: the same rule as the database
 * (dk_dish_configuration), only to show the total live. The server
 * recalculates and validates everything when the order is placed: the price
 * that is charged never comes from here.
 *   · a required group needs at least `minSelect`; nobody chooses more than `maxSelect`;
 *   · the same option more than once only where the group allows it;
 *   · unit price = base price + Σ extras × quantity (included and courtesy add 0).
 */
export type OptionPricing = 'included' | 'extra' | 'courtesy'

export interface OptionChoice {
  id: string
  name: string
  pricing: OptionPricing
  price: number
  isDefault: boolean
  /** Public menu: there is stock for one unit (false = sold out). */
  available?: boolean
  /** Admin: an inactive option is not offered. */
  active?: boolean
}

export interface OptionGroup {
  id: string
  name: string
  minSelect: number
  maxSelect: number
  allowRepeat: boolean
  options: OptionChoice[]
}

/** optionId → how many. */
export type Selection = Record<string, number>

export interface ChosenOption {
  optionId: string
  groupName: string
  name: string
  quantity: number
  pricing: OptionPricing
  unitPrice: number
}

const offered = (o: OptionChoice) => o.active !== false && o.available !== false

/** The defaults the customer starts with (only what can be offered). */
export function defaultSelection(groups: OptionGroup[]): Selection {
  const sel: Selection = {}
  for (const g of groups) {
    for (const o of g.options.filter((x) => x.isDefault && offered(x)).slice(0, g.maxSelect)) sel[o.id] = 1
  }
  return sel
}

export function groupCount(group: OptionGroup, sel: Selection): number {
  return group.options.reduce((sum, o) => sum + (sel[o.id] ?? 0), 0)
}

/**
 * Tapping an option: a group of one is a radio; of several, a checkbox (or a counter when it allows repeats).
 * `delta` is +1 / −1 for counters. Never goes past the group's limit.
 */
export function choose(group: OptionGroup, sel: Selection, optionId: string, delta: 1 | -1 = 1): Selection {
  const option = group.options.find((o) => o.id === optionId)
  if (!option || !offered(option)) return sel
  const next = { ...sel }
  const current = next[optionId] ?? 0
  if (group.maxSelect === 1 && !group.allowRepeat) {
    if (current > 0 && group.minSelect === 0) delete next[optionId]
    else {
      for (const o of group.options) delete next[o.id]
      next[optionId] = 1
    }
    return next
  }
  if (!group.allowRepeat) {
    if (current > 0) delete next[optionId]
    else if (groupCount(group, sel) < group.maxSelect) next[optionId] = 1
    return next
  }
  const wanted = current + delta
  if (wanted <= 0) delete next[optionId]
  else if (delta < 0 || groupCount(group, sel) < group.maxSelect) next[optionId] = wanted
  return next
}

/** The required groups still missing a choice. */
export function missingGroups(groups: OptionGroup[], sel: Selection): OptionGroup[] {
  return groups.filter((g) => groupCount(g, sel) < g.minSelect)
}

/** What was chosen, in the order of the dish's groups and options. */
export function chosenOptions(groups: OptionGroup[], sel: Selection): ChosenOption[] {
  return groups.flatMap((g) =>
    g.options
      .filter((o) => (sel[o.id] ?? 0) > 0)
      .map((o) => ({ optionId: o.id, groupName: g.name, name: o.name, quantity: sel[o.id], pricing: o.pricing, unitPrice: o.pricing === 'extra' ? o.price : 0 })),
  )
}

export function extrasPerUnit(groups: OptionGroup[], sel: Selection): number {
  return chosenOptions(groups, sel).reduce((sum, o) => sum + o.unitPrice * o.quantity, 0)
}

export function unitPrice(basePrice: number, groups: OptionGroup[], sel: Selection): number {
  return basePrice + extrasPerUnit(groups, sel)
}

/** What travels to the server: [{optionId, quantity}], in a stable order. */
export function toPayload(sel: Selection): { optionId: string; quantity: number }[] {
  return Object.entries(sel)
    .filter(([, q]) => q > 0)
    .map(([optionId, quantity]) => ({ optionId, quantity }))
    .sort((a, b) => a.optionId.localeCompare(b.optionId))
}

export function fromPayload(options: { optionId: string; quantity: number }[] | undefined): Selection {
  return Object.fromEntries((options ?? []).map((o) => [o.optionId, o.quantity]))
}

/** The same dish chosen the same way is the same cart line (the server merges by the same rule). */
export function lineSignature(productId: string, options: { optionId: string; quantity: number }[] | undefined): string {
  const opts = [...(options ?? [])].filter((o) => o.quantity > 0).sort((a, b) => a.optionId.localeCompare(b.optionId))
  return opts.length ? `${productId}:${opts.map((o) => `${o.optionId}x${o.quantity}`).join(',')}` : productId
}

/** «Sancocho · Res · Patacones ×2» — the short summary of a line. */
export function chosenSummary(chosen: Pick<ChosenOption, 'name' | 'quantity'>[]): string {
  return chosen.map((o) => (o.quantity > 1 ? `${o.name} ×${o.quantity}` : o.name)).join(' · ')
}

/** How an option's price reads: «+$2.000», «Incluido», «Cortesía». */
export function pricingLabel(option: Pick<OptionChoice, 'pricing' | 'price'>, money: (n: number) => string): string {
  if (option.pricing === 'extra') return `+${money(option.price)}`
  return option.pricing === 'courtesy' ? 'Cortesía' : 'Incluido'
}

/** «Obligatorio · elige 1», «Opcional · hasta 3». */
export function groupRule(group: Pick<OptionGroup, 'minSelect' | 'maxSelect'>): string {
  if (group.minSelect > 0) return group.minSelect === group.maxSelect ? `Obligatorio · elige ${group.minSelect}` : `Obligatorio · de ${group.minSelect} a ${group.maxSelect}`
  return group.maxSelect === 1 ? 'Opcional' : `Opcional · hasta ${group.maxSelect}`
}
