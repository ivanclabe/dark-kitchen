import { formatMoney } from '@/shared/utils/format'
import { whatsappLink } from '@/shared/utils/whatsapp'
import clsx from 'clsx'
import { ArrowLeft, Minus, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PlaceOrderError, placePublicOrder } from '../api/publicMenu'
import { cartIssues, cartTotals, formatHour, lineKey, lineUnitPrice, maxQuantity, openLabel, quantityOf, replaceLine, setLineQuantity, setNote } from '../lib/cart'
import { chosenOptions, chosenSummary, fromPayload } from '@/shared/composition/composition'
import { DishSheet } from './DishSheet'
import type { CartLine, Fulfillment, PublicMenu, PublicPaymentMethod } from '../types'

const inputClass =
  'mt-1 w-full rounded-xl border border-(--pm-border) bg-(--pm-surface) px-3.5 py-2.5 text-base text-(--pm-text) outline-none placeholder:text-(--pm-muted) focus:border-(--pm-primary) focus:ring-2 focus:ring-(--pm-primary)/20'
const primaryBtn = 'w-full bg-(--pm-primary) py-3.5 font-semibold text-(--pm-on-primary) disabled:opacity-40'
const btnRadius = { borderRadius: 'var(--pm-btn-radius)' }
const PAY_LABEL: Record<PublicPaymentMethod, string> = { Efectivo: 'Efectivo', Transferencia: 'Transferencia', Tarjeta: 'Tarjeta (datáfono)' }

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-(--pm-muted)">{hint}</span>}
    </label>
  )
}

/**
 * The cart and the order (ADR 0052): lines with a note for the kitchen,
 * totals, and the short form. The server recalculates everything; if
 * something changed (sold out, its hour ended, closed) it says what.
 * Themed by the page (ADR 0053); in `preview` nothing is sent.
 */
export function CartSheet({
  slug,
  menu,
  lines,
  preview = false,
  onLines,
  onClose,
  onRefreshMenu,
  onPlaced,
}: {
  slug: string
  menu: PublicMenu
  lines: CartLine[]
  preview?: boolean
  onLines: (lines: CartLine[]) => void
  onClose: () => void
  onRefreshMenu: () => void
  onPlaced: (token: string) => void
}) {
  const ordering = menu.ordering
  const [step, setStep] = useState<'cart' | 'checkout'>('cart')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [fulfillment, setFulfillment] = useState<Fulfillment>(ordering.delivery ? 'delivery' : 'pickup')
  const [address, setAddress] = useState('')
  const [reference, setReference] = useState('')
  const [payment, setPayment] = useState<PublicPaymentMethod>(ordering.paymentMethods[0] ?? 'Efectivo')
  const [notes, setNotes] = useState('')
  const [whatsappOptIn, setWhatsappOptIn] = useState(false)
  const [website, setWebsite] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One key per attempt to order this cart: sending again (a retry, a double tap) is the same order.
  const idempotencyKey = useRef(crypto.randomUUID())

  const byId = useMemo(() => new Map(menu.items.map((i) => [i.id, i])), [menu.items])
  const totals = cartTotals(lines, menu, fulfillment)
  const issues = cartIssues(lines, menu.items)
  const open = openLabel(menu.business.openState)
  const closed = open.open === false

  useEffect(() => {
    if (preview) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [preview])

  const formProblem =
    name.trim().length < 2
      ? 'Escribe tu nombre'
      : phone.replace(/\D/g, '').length < 7
        ? 'Escribe tu celular'
        : fulfillment === 'delivery' && address.trim().length < 5
          ? 'Escribe la dirección'
          : null

  // ADR 0059: what was chosen in each line, «Sancocho · Res · Patacones ×2».
  const summaryOf = (l: CartLine) => {
    const item = byId.get(l.productId)
    return item ? chosenSummary(chosenOptions(item.groups ?? [], fromPayload(l.options))) : ''
  }
  const [editing, setEditing] = useState<CartLine | null>(null)

  function whatsappOrderText() {
    const items = lines.map((l) => {
      const item = byId.get(l.productId)
      const chosen = summaryOf(l)
      return item ? `• ${l.quantity} × ${item.name}${chosen ? ` (${chosen})` : ''}${l.note ? ` — ${l.note}` : ''}` : null
    })
    return [`Hola, quiero pedir en ${menu.business.name}:`, ...items.filter(Boolean), `Total: ${formatMoney(totals.subtotal)}`].join('\n')
  }

  async function submit() {
    if (preview) return
    setError(null)
    setSending(true)
    try {
      const result = await placePublicOrder(slug, {
        idempotencyKey: idempotencyKey.current,
        customer: { name: name.trim(), phone: phone.trim() },
        fulfillment,
        address: address.trim(),
        reference: reference.trim(),
        paymentMethod: payment,
        notes: notes.trim(),
        items: lines,
        whatsappOptIn: ordering.whatsappNotices ? whatsappOptIn : false,
        website,
      })
      onPlaced(result.token)
    } catch (err) {
      if (err instanceof PlaceOrderError) {
        if (['unavailable', 'limit', 'stock', 'closed'].includes(err.code)) {
          onRefreshMenu()
          // Something changed: a new attempt after fixing it is a new order.
          idempotencyKey.current = crypto.randomUUID()
          setStep('cart')
        }
        setError(err.code === 'closed' && err.detail ? `${err.message}. Abre a las ${formatHour(err.detail.slice(11, 16))}.` : err.message)
      } else {
        setError('No pudimos enviar el pedido. Intenta de nuevo.')
      }
    } finally {
      setSending(false)
    }
  }

  const editingItem = editing ? byId.get(editing.productId) : undefined
  if (editing && editingItem)
    return (
      <DishSheet
        item={editingItem}
        initial={{ options: editing.options, quantity: editing.quantity }}
        maxQuantity={maxQuantity(editingItem) - quantityOf(lines, editingItem.id) + editing.quantity}
        confirmLabel="Guardar cambios"
        onClose={() => setEditing(null)}
        onConfirm={(options, q) => {
          onLines(replaceLine(lines, lineKey(editing), editingItem, options, q))
          setEditing(null)
        }}
      />
    )

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 pm-wide:items-center" role="dialog" aria-modal="true" aria-label="Tu pedido">
      <div className="flex max-h-[92%] w-full max-w-lg flex-col rounded-t-3xl bg-(--pm-bg) text-(--pm-text) shadow-2xl ring-1 ring-(--pm-border) pm-wide:rounded-3xl">
        <div className="flex items-center gap-2 border-b border-(--pm-border) px-4 py-3">
          {step === 'checkout' && (
            <button type="button" onClick={() => setStep('cart')} className="flex size-9 items-center justify-center rounded-full hover:bg-(--pm-soft)" aria-label="Volver al pedido">
              <ArrowLeft size={18} aria-hidden />
            </button>
          )}
          <h2 className="flex-1 text-lg font-semibold" style={{ fontFamily: 'var(--pm-font-heading)' }}>{step === 'cart' ? 'Tu pedido' : 'Tus datos'}</h2>
          <button type="button" onClick={onClose} className="flex size-9 items-center justify-center rounded-full hover:bg-(--pm-soft)" aria-label="Cerrar">
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-800 ring-1 ring-red-200">
              {error}
            </p>
          )}

          {step === 'cart' ? (
            <>
              {issues.length > 0 && (
                <ul className="space-y-1 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
                  {issues.map((i, n) => (
                    <li key={`${i.productId}-${n}`}>• {i.message}</li>
                  ))}
                </ul>
              )}
              <ul className="divide-y divide-(--pm-border)">
                {lines.map((l) => {
                  const item = byId.get(l.productId)
                  if (!item) return null
                  const key = lineKey(l)
                  const unit = lineUnitPrice(item, l)
                  const chosen = summaryOf(l)
                  return (
                    <li key={key} className="space-y-2 py-3">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{item.name}</p>
                          {chosen && <p className="text-sm text-(--pm-muted)">{chosen}</p>}
                          <p className="text-sm text-(--pm-muted) tabular-nums">
                            {formatMoney(unit)} c/u
                            {(item.groups?.length ?? 0) > 0 && (
                              <button type="button" onClick={() => setEditing(l)} className="ml-2 font-medium text-(--pm-primary) underline-offset-2 hover:underline" aria-label={`Editar ${item.name}`}>
                                Editar
                              </button>
                            )}
                          </p>
                        </div>
                        <span className="flex items-center gap-1 rounded-full bg-(--pm-soft) p-1">
                          <button type="button" onClick={() => onLines(setLineQuantity(lines, key, item, l.quantity - 1))} className="flex size-8 items-center justify-center rounded-full bg-(--pm-surface) shadow-sm" aria-label={`Quitar un ${item.name}`}>
                            <Minus size={15} aria-hidden />
                          </button>
                          <span className="min-w-6 text-center text-sm font-semibold tabular-nums">{l.quantity}</span>
                          <button
                            type="button"
                            onClick={() => onLines(setLineQuantity(lines, key, item, l.quantity + 1))}
                            disabled={quantityOf(lines, item.id) >= maxQuantity(item)}
                            className="flex size-8 items-center justify-center rounded-full bg-(--pm-primary) text-(--pm-on-primary) disabled:opacity-40"
                            aria-label={`Agregar otro ${item.name}`}
                          >
                            <Plus size={15} aria-hidden />
                          </button>
                        </span>
                        <span className="w-20 text-right font-semibold tabular-nums">{formatMoney(unit * l.quantity)}</span>
                      </div>
                      <input
                        value={l.note}
                        onChange={(e) => onLines(setNote(lines, key, e.target.value))}
                        placeholder="Nota para la cocina (sin cebolla, salsa aparte…)"
                        aria-label={`Nota para ${item.name}`}
                        className="w-full rounded-lg bg-(--pm-soft) px-3 py-2 text-sm outline-none placeholder:text-(--pm-muted) focus:ring-2 focus:ring-(--pm-primary)/20"
                        maxLength={200}
                      />
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <form id="checkout" className="space-y-4" onSubmit={(e) => (e.preventDefault(), void submit())}>
              <Field label="Tu nombre">
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} required />
              </Field>
              <Field label="Tu celular" hint="El negocio te escribe a este número si hace falta.">
                <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="300 123 4567" required />
              </Field>
              {ordering.whatsappNotices && (
                <label className="flex items-start gap-2.5 rounded-xl bg-(--pm-soft) px-3 py-2.5 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4 accent-(--pm-primary)" checked={whatsappOptIn} onChange={(e) => setWhatsappOptIn(e.target.checked)} />
                  <span>
                    Recibir el estado de mi pedido por WhatsApp
                    <span className="block text-xs text-(--pm-muted)">Solo avisos de este pedido. Escribe BAJA para no recibir más.</span>
                  </span>
                </label>
              )}
              {ordering.delivery && ordering.pickup && (
                <fieldset>
                  <legend className="text-sm font-medium">¿Cómo lo recibes?</legend>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {(['delivery', 'pickup'] as const).map((f) => (
                      <label key={f} className={clsx('cursor-pointer rounded-xl px-3 py-2.5 text-center text-sm font-medium ring-1', fulfillment === f ? 'bg-(--pm-primary) text-(--pm-on-primary) ring-(--pm-primary)' : 'bg-(--pm-surface) ring-(--pm-border)')}>
                        <input type="radio" name="fulfillment" className="sr-only" checked={fulfillment === f} onChange={() => setFulfillment(f)} />
                        {f === 'delivery' ? `Domicilio${ordering.deliveryFee ? ` (+${formatMoney(ordering.deliveryFee)})` : ''}` : 'Recoger'}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {fulfillment === 'delivery' && (
                <>
                  <Field label="Dirección de entrega">
                    <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" maxLength={200} required />
                  </Field>
                  <Field label="Referencia (opcional)">
                    <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Apto, torre, casa de rejas negras…" maxLength={200} />
                  </Field>
                </>
              )}
              <fieldset>
                <legend className="text-sm font-medium">¿Cómo pagas?</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {ordering.paymentMethods.map((m) => (
                    <label key={m} className={clsx('cursor-pointer rounded-full px-4 py-2 text-sm font-medium ring-1', payment === m ? 'bg-(--pm-primary) text-(--pm-on-primary) ring-(--pm-primary)' : 'bg-(--pm-surface) ring-(--pm-border)')}>
                      <input type="radio" name="payment" className="sr-only" checked={payment === m} onChange={() => setPayment(m)} />
                      {PAY_LABEL[m]}
                    </label>
                  ))}
                </div>
                {payment === 'Transferencia' && ordering.transferInstructions && <p className="mt-2 rounded-lg bg-(--pm-soft) px-3 py-2 text-sm">{ordering.transferInstructions}</p>}
              </fieldset>
              <Field label="Notas del pedido (opcional)">
                <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
              </Field>
              {/* A trap for robots: hidden from people. */}
              <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
            </form>
          )}
        </div>

        <div className="space-y-2 border-t border-(--pm-border) px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-(--pm-muted)">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(totals.subtotal)}</dd>
            </div>
            {step === 'checkout' && fulfillment === 'delivery' && (
              <div className="flex justify-between">
                <dt className="text-(--pm-muted)">Domicilio</dt>
                <dd className="tabular-nums">{formatMoney(totals.deliveryFee)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(step === 'checkout' ? totals.total : totals.subtotal)}</dd>
            </div>
          </dl>
          {!ordering.enabled ? (
            preview ? (
              <p style={btnRadius} className="flex w-full items-center justify-center bg-emerald-600/60 py-3.5 font-semibold text-white">
                Vista previa: Pedir por WhatsApp
              </p>
            ) : menu.business.whatsapp ? (
              <a href={whatsappLink(menu.business.whatsapp, whatsappOrderText())} target="_blank" rel="noreferrer" style={btnRadius} className="flex w-full items-center justify-center bg-emerald-600 py-3.5 font-semibold text-white">
                Pedir por WhatsApp
              </a>
            ) : (
              <p className="text-center text-sm text-(--pm-muted)">Este negocio no recibe pedidos por aquí.</p>
            )
          ) : closed ? (
            <p className="rounded-xl bg-(--pm-soft) px-3 py-2.5 text-center text-sm">{open.text}. Puedes armar tu pedido y enviarlo cuando abra.</p>
          ) : step === 'cart' ? (
            <>
              {totals.belowMinimum > 0 && <p className="text-center text-sm text-(--pm-muted)">Te faltan {formatMoney(totals.belowMinimum)} para el pedido mínimo.</p>}
              <button
                type="button"
                onClick={() => setStep('checkout')}
                disabled={totals.units === 0 || issues.length > 0 || totals.belowMinimum > 0}
                style={btnRadius}
                className={primaryBtn}
              >
                Continuar
              </button>
            </>
          ) : (
            <button type="submit" form="checkout" disabled={preview || sending || formProblem !== null} style={btnRadius} className={primaryBtn}>
              {preview ? 'Vista previa: aquí el cliente envía su pedido' : sending ? 'Enviando…' : formProblem ?? `Hacer pedido · ${formatMoney(totals.total)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
