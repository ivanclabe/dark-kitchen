import { useRegisterPayment, useVoidPayment } from '@/modules/cartera/hooks/useReceivables'
import { OTHER_PAYMENT_METHOD, PAYMENT_METHODS } from '../lib/paymentMethods'
import { CurrencyInput } from '@/shared/ui/CurrencyInput'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Badge, type BadgeTone } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Chip } from '@/shared/ui/Chip'
import { Input } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDateTime, formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { Banknote, Check, ChevronDown, ChevronUp, Undo2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { PAYMENT_STATE_LABEL, paymentSummary, voidedPaymentIds, type PaymentState } from '../lib/payment'
import type { Order, OrderPayment } from '../types'

const STATE_TONE: Record<PaymentState, BadgeTone> = { paid: 'success', partial: 'info', pending: 'warning' }

/** The payment dimension next to the operational status (ADR 0031). Nothing for a cancelled order. */
export function PaymentBadge({ order, size = 'md' }: { order: Pick<Order, 'total' | 'status' | 'payments'>; size?: 'sm' | 'md' }) {
  const summary = paymentSummary(order)
  if (!summary) return null
  return (
    <Badge tone={STATE_TONE[summary.state]} size={size} dot>
      {PAYMENT_STATE_LABEL[summary.state]}
    </Badge>
  )
}

/** The usual ways to pay: one tap. The method stays free text in the ledger, as before. */
const METHODS = PAYMENT_METHODS
const OTHER = OTHER_PAYMENT_METHOD

function RegisterForm({ order, balance, onDone }: { order: Order; balance: number; onDone: () => void }) {
  const register = useRegisterPayment()
  const { show } = useToast()
  const [amount, setAmount] = useState<number | null>(balance)
  const [method, setMethod] = useState<string>(METHODS.includes(order.paymentMethod as (typeof METHODS)[number]) ? order.paymentMethod! : 'Efectivo')
  const [otherMethod, setOtherMethod] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const value = amount ?? 0
    if (!(value > 0)) return setError('El monto debe ser mayor a cero.')
    if (value > balance) return setError(`El monto supera el saldo de ${formatMoney(balance)}.`)
    try {
      await register.mutateAsync({ orderId: order.id, amount: value, method: method === OTHER ? otherMethod.trim() : method, note: note.trim() })
      show(`Pago de ${formatMoney(value, { code: true })} registrado en el pedido #${order.orderNumber}.`)
      onDone()
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo registrar el pago'))
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-3 rounded-xl border border-neutral-800/60 bg-neutral-950/40 p-3" aria-label="Registrar pago">
      <label className="block text-xs text-neutral-400">
        Monto
        <CurrencyInput value={amount} onValueChange={setAmount} autoFocus className="!mt-1" aria-label="Monto del pago" />
      </label>
      <div role="group" aria-label="Método de pago" className="flex flex-wrap gap-1.5">
        {[...METHODS, OTHER].map((m) => (
          <Chip key={m} label={m} active={method === m} onClick={() => setMethod(m)} />
        ))}
      </div>
      {method === OTHER && <Input value={otherMethod} onChange={(e) => setOtherMethod(e.target.value)} placeholder="¿Cómo pagó?" aria-label="Otro método de pago" />}
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" aria-label="Nota del pago" />
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={register.isPending}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" size="sm" icon={Check} loading={register.isPending}>
          Confirmar pago
        </Button>
      </div>
    </form>
  )
}

function PaymentRow({ payment, voided, canVoid }: { payment: OrderPayment; voided: boolean; canVoid: boolean }) {
  const voidPayment = useVoidPayment()
  const { show } = useToast()
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const isVoid = payment.voidsPaymentId !== null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!reason.trim()) return setError('Escribe el motivo de la anulación.')
    try {
      await voidPayment.mutateAsync({ paymentId: payment.id, reason: reason.trim() })
      show(`Pago de ${formatMoney(payment.amount)} anulado.`, 'info')
      setVoiding(false)
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo anular el pago'))
    }
  }

  return (
    <li className="py-2 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={clsx('tabular-nums', isVoid ? 'text-neutral-400' : voided ? 'text-neutral-500 line-through' : 'text-neutral-100')}>
            {isVoid ? `Anulación ${formatMoney(payment.amount)}` : formatMoney(payment.amount)}
            {payment.method && !isVoid && <span className="text-neutral-400 no-underline"> · {payment.method}</span>}
          </p>
          <p className="text-xs text-neutral-500">
            {formatDateTime(payment.createdAt)}
            {payment.createdBy && ` · ${payment.createdBy}`}
            {payment.note && ` · ${payment.note}`}
          </p>
        </div>
        {voided && !isVoid && (
          <Badge size="sm" tone="neutral">
            Anulado
          </Badge>
        )}
        {canVoid && !voided && !isVoid && !voiding && (
          <Button variant="link" size="sm" icon={Undo2} onClick={() => setVoiding(true)} className="!text-neutral-400 hover:!text-red-400">
            Anular
          </Button>
        )}
      </div>
      {voiding && (
        <form onSubmit={(e) => void submit(e)} className="mt-2 flex flex-wrap items-center gap-2" aria-label="Anular pago">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (obligatorio)" aria-label="Motivo de la anulación" autoFocus className="!mt-0 min-w-48 flex-1" />
          <Button type="button" variant="ghost" size="sm" onClick={() => setVoiding(false)} disabled={voidPayment.isPending}>
            Volver
          </Button>
          <Button type="submit" variant="danger" size="sm" loading={voidPayment.isPending}>
            Anular pago
          </Button>
          {error && (
            <p role="alert" className="w-full text-sm text-red-400">
              {error}
            </p>
          )}
        </form>
      )}
    </li>
  )
}

/**
 * Pago, inside the order (ADR 0031): its state apart from the operational
 * status, «Registrar pago» in place (the amount comes filled with the
 * balance, the method is one tap) and its payments, each one voidable with a
 * reason. The same function as Clientes (dk_register_payment): one concept,
 * one name, one source of truth. Only with receivables.view; registering and
 * voiding need receivables.collect.
 */
export function PaymentCard({ order }: { order: Order }) {
  const { can } = useActiveKitchen()
  const [registering, setRegistering] = useState(false)
  const summary = paymentSummary(order)
  const [showPayments, setShowPayments] = useState(summary?.state === 'partial')
  if (!can('receivables.view')) return null
  // A cancelled order shows its payments only if it has any (to void them, if they must be returned).
  if (!summary && order.payments.length === 0) return null

  const canCollect = can('receivables.collect')
  const voided = voidedPaymentIds(order.payments)

  return (
    <Card title="Pago" icon={Banknote} action={summary && <PaymentBadge order={order} />}>
      {summary ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-300">
            {summary.state === 'paid' ? (
              <span className="flex items-center gap-1.5 text-emerald-300">
                <Check size={14} aria-hidden /> Pagado · {formatMoney(summary.paid)}
              </span>
            ) : (
              <>
                <span className="font-semibold tabular-nums text-neutral-50">{formatMoney(summary.balance)}</span> por cobrar
                {summary.paid > 0 && <span className="text-neutral-500"> · pagado {formatMoney(summary.paid)}</span>}
              </>
            )}
          </p>
          {summary.balance > 0 && canCollect && !registering && (
            <Button variant="primary" size="sm" icon={Banknote} onClick={() => setRegistering(true)}>
              Registrar pago
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-neutral-400">Pedido cancelado: estos son sus pagos.</p>
      )}

      {registering && summary && <RegisterForm order={order} balance={summary.balance} onDone={() => setRegistering(false)} />}

      {order.payments.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowPayments((v) => !v)} aria-expanded={showPayments} className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-100">
            {showPayments ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />} Ver detalle ({order.payments.length})
          </button>
          {showPayments && (
            <ul className="mt-1 divide-y divide-neutral-800/60">
              {order.payments.map((p) => (
                <PaymentRow key={p.id} payment={p} voided={voided.has(p.id)} canVoid={canCollect} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}
