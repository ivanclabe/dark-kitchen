import { productImageUrl } from '@/modules/products/lib/productImages'
import { chosenOptions, defaultSelection, fromPayload, missingGroups, toPayload, unitPrice, type Selection } from '@/shared/composition/composition'
import { OptionPicker } from '@/shared/composition/OptionPicker'
import { formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { Minus, Plus, X } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import type { PublicMenuItem } from '../types'

const heading: CSSProperties = { fontFamily: 'var(--pm-font-heading)' }
const btnRadius: CSSProperties = { borderRadius: 'var(--pm-btn-radius)' }

/**
 * A configurable dish (ADR 0059, D6): photo, options, quantity and a final summary before it goes into the
 * cart. «Agregar» is enabled once the required groups are chosen. The server recalculates the price.
 */
export function DishSheet({
  item,
  initial,
  maxQuantity,
  confirmLabel = 'Agregar',
  onConfirm,
  onClose,
}: {
  item: PublicMenuItem
  initial?: { options?: { optionId: string; quantity: number }[]; quantity: number }
  maxQuantity: number
  confirmLabel?: string
  onConfirm: (options: { optionId: string; quantity: number }[], quantity: number) => void
  onClose: () => void
}) {
  const groups = item.groups ?? []
  const [selection, setSelection] = useState<Selection>(() => (initial?.options ? fromPayload(initial.options) : defaultSelection(groups)))
  const [quantity, setQuantity] = useState(Math.min(initial?.quantity ?? 1, Math.max(maxQuantity, 1)))
  const missing = missingGroups(groups, selection)
  const chosen = chosenOptions(groups, selection)
  const unit = unitPrice(item.price, groups, selection)
  const total = unit * quantity

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 pm-wide:items-center" role="dialog" aria-modal="true" aria-label={item.name}>
      <div className="flex max-h-[94%] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-(--pm-bg) text-(--pm-text) shadow-2xl ring-1 ring-(--pm-border) pm-wide:rounded-3xl">
        <div className="flex-1 overflow-y-auto">
          <div className="relative">
            {item.imagePath ? (
              <img src={productImageUrl(item.imagePath)} alt="" className="aspect-[16/9] w-full object-cover" />
            ) : (
              <div className="h-14" aria-hidden />
            )}
            <button
              type="button"
              onClick={onClose}
              className={clsx(
                'absolute top-3 right-3 flex size-9 items-center justify-center rounded-full',
                item.imagePath ? 'bg-black/40 text-white backdrop-blur' : 'bg-(--pm-soft) text-(--pm-text)',
              )}
              aria-label="Cerrar"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="space-y-5 px-5 pt-4 pb-5">
            <div>
              <h2 className="text-2xl leading-tight font-bold tracking-tight" style={heading}>
                {item.name}
              </h2>
              {item.description && <p className="mt-1 text-sm leading-relaxed text-(--pm-muted)">{item.description}</p>}
              <p className="mt-2 font-semibold text-(--pm-price) tabular-nums">{formatMoney(item.price)}</p>
            </div>

            <OptionPicker groups={groups} selection={selection} onChange={setSelection} />

            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold" style={heading}>
                Cantidad
              </span>
              <span className="flex items-center gap-1 bg-(--pm-surface) p-1 ring-1 ring-(--pm-border)" style={btnRadius}>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="flex size-8 items-center justify-center rounded-full bg-(--pm-soft) disabled:opacity-40"
                  aria-label="Uno menos"
                >
                  <Minus size={15} aria-hidden />
                </button>
                <span className="min-w-7 text-center font-bold tabular-nums" aria-live="polite">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                  disabled={quantity >= maxQuantity}
                  className="flex size-8 items-center justify-center rounded-full bg-(--pm-primary) text-(--pm-on-primary) disabled:opacity-40"
                  aria-label="Uno más"
                >
                  <Plus size={15} aria-hidden />
                </button>
              </span>
            </div>

            {/* The final summary: what goes into the cart, and what it costs. */}
            <section aria-label="Resumen" className="space-y-1.5 rounded-2xl bg-(--pm-soft) px-4 py-3.5 text-sm">
              <p className="flex justify-between gap-3">
                <span>{item.name}</span>
                <span className="tabular-nums">{formatMoney(item.price)}</span>
              </p>
              {chosen.map((o) => (
                <p key={o.optionId} className="flex justify-between gap-3 text-(--pm-muted)">
                  <span>
                    {o.groupName}: {o.name}
                    {o.quantity > 1 ? ` ×${o.quantity}` : ''}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {o.pricing === 'extra' ? `+${formatMoney(o.unitPrice * o.quantity)}` : o.pricing === 'courtesy' ? 'Cortesía' : 'Incluido'}
                  </span>
                </p>
              ))}
              <p className="flex justify-between gap-3 border-t border-(--pm-border) pt-2 font-bold">
                <span>{quantity > 1 ? `${quantity} × ${formatMoney(unit)}` : 'Total'}</span>
                <span className="tabular-nums">{formatMoney(total)}</span>
              </p>
            </section>
          </div>
        </div>

        <div className="border-t border-(--pm-border) px-5 pt-3 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
          {missing.length > 0 && <p className="mb-2 text-center text-xs font-medium text-(--pm-primary)">Elige: {missing.map((g) => g.name).join(', ')}</p>}
          <button
            type="button"
            onClick={() => onConfirm(toPayload(selection), quantity)}
            disabled={missing.length > 0 || maxQuantity < 1}
            style={btnRadius}
            className="flex w-full items-center justify-between gap-3 bg-(--pm-primary) px-5 py-3.5 font-semibold text-(--pm-on-primary) transition hover:opacity-90 disabled:opacity-40"
          >
            <span>{confirmLabel}</span>
            <span className="tabular-nums">{formatMoney(total)}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
