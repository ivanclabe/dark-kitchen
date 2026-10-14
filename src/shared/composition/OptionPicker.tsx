import { formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { Minus, Plus } from 'lucide-react'
import type { CSSProperties } from 'react'
import { choose, groupCount, groupRule, pricingLabel, type OptionGroup, type Selection } from './composition'

const heading: CSSProperties = { fontFamily: 'var(--pm-font-heading)' }

/**
 * The options of a dish (ADR 0059): one block per group with its rule, and each option with its price.
 * A group of one is a radio, of several a checkbox, and a counter where the same option can repeat.
 * Drawn with the page's theme variables, so it also serves the editor preview and the cashier.
 */
export function OptionPicker({ groups, selection, onChange }: { groups: OptionGroup[]; selection: Selection; onChange: (next: Selection) => void }) {
  return (
    <div className="space-y-5 text-(--pm-text)">
      {groups.map((g) => {
        const count = groupCount(g, selection)
        const missing = count < g.minSelect
        const radio = g.maxSelect === 1 && !g.allowRepeat
        return (
          <fieldset key={g.id} className="space-y-2">
            <legend className="flex w-full items-baseline justify-between gap-3">
              <span className="font-semibold" style={heading}>
                {g.name}
              </span>
              <span className={clsx('rounded-full px-2 py-0.5 text-[0.7rem] font-semibold', missing ? 'bg-(--pm-primary)/12 text-(--pm-primary)' : 'bg-(--pm-soft) text-(--pm-muted)')}>
                {groupRule(g)}
              </span>
            </legend>
            <ul className="divide-y divide-(--pm-border) rounded-2xl bg-(--pm-surface) ring-1 ring-(--pm-border)">
              {g.options.map((o) => {
                const qty = selection[o.id] ?? 0
                const soldOut = o.available === false
                const full = !radio && qty === 0 && count >= g.maxSelect
                const price = soldOut ? 'Agotado' : pricingLabel(o, formatMoney)
                const priceClass = clsx('shrink-0 text-sm tabular-nums', o.pricing === 'extra' ? 'font-semibold text-(--pm-text)' : 'text-(--pm-muted)', soldOut && 'text-(--pm-muted)')
                if (g.allowRepeat)
                  return (
                    <li key={o.id} className={clsx('flex items-center gap-3 px-3.5 py-3', soldOut && 'opacity-50')}>
                      <span className="min-w-0 flex-1">{o.name}</span>
                      <span className={priceClass}>{price}</span>
                      <span className="flex items-center gap-1">
                        {qty > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => onChange(choose(g, selection, o.id, -1))}
                              className="flex size-7 items-center justify-center rounded-full bg-(--pm-soft)"
                              aria-label={`Quitar ${o.name}`}
                            >
                              <Minus size={14} aria-hidden />
                            </button>
                            <span className="min-w-5 text-center text-sm font-bold tabular-nums">{qty}</span>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => onChange(choose(g, selection, o.id, 1))}
                          disabled={soldOut || count >= g.maxSelect}
                          className="flex size-7 items-center justify-center rounded-full bg-(--pm-primary) text-(--pm-on-primary) disabled:opacity-35"
                          aria-label={`Agregar ${o.name}`}
                        >
                          <Plus size={14} aria-hidden />
                        </button>
                      </span>
                    </li>
                  )
                return (
                  <li key={o.id}>
                    <label className={clsx('flex cursor-pointer items-center gap-3 px-3.5 py-3', (soldOut || full) && 'cursor-not-allowed opacity-50')}>
                      <input
                        type={radio ? 'radio' : 'checkbox'}
                        name={`group-${g.id}`}
                        checked={qty > 0}
                        disabled={soldOut || full}
                        onChange={() => onChange(choose(g, selection, o.id))}
                        className="size-4.5 shrink-0 accent-(--pm-primary)"
                      />
                      <span className="min-w-0 flex-1">{o.name}</span>
                      <span className={priceClass}>{price}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </fieldset>
        )
      })}
    </div>
  )
}
