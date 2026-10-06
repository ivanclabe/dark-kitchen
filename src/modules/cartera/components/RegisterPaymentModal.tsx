import { FormField, Input, Select } from '@/shared/ui/FormField'
import { OTHER_PAYMENT_METHOD, PAYMENT_METHODS } from '@/modules/orders/lib/paymentMethods'
import { CurrencyInput } from '@/shared/ui/CurrencyInput'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatMoney } from '@/shared/utils/format'
import { useState, type FormEvent } from 'react'
import { useRegisterPayment } from '../hooks/useReceivables'
import type { Receivable } from '../types'

/**
 * `receivables`: los pedidos con saldo contra los que se puede registrar el
 * pago — normalmente todos los de UN cliente. Si trae más de uno, aparece un
 * selector de pedido (por defecto el primero, que ya viene ordenado por
 * vencimiento más próximo desde listReceivables/useReceivables); con uno
 * solo se comporta igual que antes, sin selector.
 */
export function RegisterPaymentModal({ receivables, onClose }: { receivables: Receivable[] | null; onClose: () => void }) {
  const registerPayment = useRegisterPayment()
  const { show } = useToast()
  const [orderId, setOrderId] = useState<string | null>(null)
  const [amount, setAmount] = useState<number | null>(null)
  const [method, setMethod] = useState('')
  const [otherMethod, setOtherMethod] = useState('')
  const [note, setNote] = useState('')
  const [amountError, setAmountError] = useState<string | null>(null)

  const open = !!receivables && receivables.length > 0
  const selected = open ? (receivables.find((r) => r.orderId === orderId) ?? receivables[0]) : null

  function reset() {
    setOrderId(null)
    setAmount(null)
    setMethod('')
    setOtherMethod('')
    setNote('')
    setAmountError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selected) return
    const value = amount ?? 0
    if (!value || value <= 0) {
      setAmountError('Ingresa un monto mayor a cero.')
      return
    }
    if (value > selected.balance) {
      setAmountError(`El abono no puede superar el saldo (${formatMoney(selected.balance)}).`)
      return
    }
    try {
      await registerPayment.mutateAsync({ orderId: selected.orderId, amount: value, method: (method === OTHER_PAYMENT_METHOD ? otherMethod.trim() : method) || null, note: note || null })
      show(`Pago de ${formatMoney(value, { code: true })} registrado para el pedido #${selected.orderNumber}.`)
      handleClose()
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo registrar el pago'), 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Registrar pago"
      description={selected ? `Pedido #${selected.orderNumber} · ${selected.customerName}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={registerPayment.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="register-payment-form" variant="primary" loading={registerPayment.isPending}>
            Registrar pago
          </Button>
        </>
      }
    >
      {selected && (
        <form id="register-payment-form" onSubmit={handleSubmit} className="space-y-4">
          {receivables && receivables.length > 1 && (
            <FormField label="Pedido">
              {(a11y) => (
                <Select {...a11y} value={selected.orderId} onChange={(e) => setOrderId(e.target.value)}>
                  {receivables.map((r) => (
                    <option key={r.orderId} value={r.orderId}>
                      #{r.orderNumber} · {formatMoney(r.balance)}
                      {r.dueDate ? ` · vence ${r.dueDate}` : ''}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          )}

          <div className="flex items-center justify-between rounded-xl border border-neutral-800/60 bg-neutral-950/60 px-4 py-3">
            <span className="text-sm text-neutral-400">Saldo pendiente</span>
            <span className="text-lg font-semibold tabular-nums text-brasa-400">{formatMoney(selected.balance)}</span>
          </div>

          <FormField label="Monto a abonar" required error={amountError} info="Puede ser una parte del saldo: el pedido queda en «Pago parcial» hasta completar el total.">
            {(a11y) => (
              <CurrencyInput
                {...a11y}
                value={amount}
                onValueChange={(v) => {
                  setAmount(v)
                  setAmountError(null)
                }}
                required
                autoFocus
              />
            )}
          </FormField>
          <FormField label="Método de pago">
            {(a11y) => (
              <Select {...a11y} value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="">Sin especificar</option>
                {[...PAYMENT_METHODS, OTHER_PAYMENT_METHOD].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          {method === OTHER_PAYMENT_METHOD && (
            <FormField label="¿Cuál?">
              {(a11y) => <Input {...a11y} value={otherMethod} onChange={(e) => setOtherMethod(e.target.value)} placeholder="Ej. Nequi, Daviplata" autoFocus />}
            </FormField>
          )}
          <FormField label="Nota">{(a11y) => <Input {...a11y} value={note} onChange={(e) => setNote(e.target.value)} />}</FormField>
        </form>
      )}
    </Modal>
  )
}
