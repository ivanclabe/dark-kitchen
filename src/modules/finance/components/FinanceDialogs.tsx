import { Button } from '@/shared/ui/Button'
import { CurrencyInput } from '@/shared/ui/CurrencyInput'
import { FormField, FormGrid, Input, Select } from '@/shared/ui/FormField'
import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatMoney, todayStr } from '@/shared/utils/format'
import { useState } from 'react'
import { PRESET_LABEL, presetRange, type DateRange, type PeriodPreset } from '@/modules/insights/lib/periods'
import { useConfirmObligationAmount, usePayObligation, usePayObligationsBatch } from '../hooks'
import { PAYMENT_METHODS, type Obligation, type PaymentMethod } from '../types'

/** The period of a tab: the presets of Insights, or custom dates. */
export function PeriodSelect({ value, onChange }: { value: { preset: PeriodPreset; range: DateRange }; onChange: (next: { preset: PeriodPreset; range: DateRange }) => void }) {
  const today = todayStr()
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Periodo">
      <Select
        aria-label="Periodo"
        value={value.preset}
        onChange={(e) => {
          const preset = e.target.value as PeriodPreset
          onChange({ preset, range: preset === 'custom' ? value.range : presetRange(preset, today) })
        }}
        className="!mt-0 w-auto min-w-[10rem]"
      >
        {(Object.keys(PRESET_LABEL) as PeriodPreset[]).map((p) => (
          <option key={p} value={p}>
            {PRESET_LABEL[p]}
          </option>
        ))}
      </Select>
      {value.preset === 'custom' && (
        <>
          <Input type="date" aria-label="Desde" value={value.range.from} max={value.range.to} onChange={(e) => e.target.value && onChange({ ...value, range: { ...value.range, from: e.target.value } })} className="!mt-0 w-auto" />
          <Input type="date" aria-label="Hasta" value={value.range.to} min={value.range.from} onChange={(e) => e.target.value && onChange({ ...value, range: { ...value.range, to: e.target.value } })} className="!mt-0 w-auto" />
        </>
      )}
    </div>
  )
}

/** Pay all or part of what is owed. */
export function PayObligationModal({ obligation, onClose }: { obligation: Obligation; onClose: () => void }) {
  const pay = usePayObligation()
  const { show } = useToast()
  const [amount, setAmount] = useState<number | null>(obligation.balance)
  const [paidOn, setPaidOn] = useState(todayStr())
  const [method, setMethod] = useState<PaymentMethod>('Transferencia')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  const invalid = !amount || amount <= 0 || amount > obligation.balance

  async function submit() {
    setError(null)
    try {
      await pay.mutateAsync({ obligationId: obligation.id, amount: amount!, paidOn, method, reference: reference.trim() || null })
      show(amount === obligation.balance ? 'Pago registrado: quedó saldada.' : `Abono registrado. Quedan ${formatMoney(obligation.balance - amount!)}.`)
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo registrar el pago'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Registrar pago"
      description={`${obligation.payee ?? obligation.description} · saldo ${formatMoney(obligation.balance)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pay.isPending}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={pay.isPending} disabled={invalid}>
            Registrar pago
          </Button>
        </>
      }
    >
      <FormGrid>
        <FormField label="Valor" required hint={amount !== null && amount < obligation.balance ? 'Abono parcial: el resto queda por pagar' : undefined}>
          {(a11y) => <CurrencyInput {...a11y} value={amount} onValueChange={setAmount} />}
        </FormField>
        <FormField label="Fecha del pago" required>
          {(a11y) => <Input {...a11y} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />}
        </FormField>
        <FormField label="Cómo se pagó" required>
          {(a11y) => (
            <Select {...a11y} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Referencia" hint="Número de la transferencia, recibo…">
          {(a11y) => <Input {...a11y} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />}
        </FormField>
      </FormGrid>
      <p className="mt-3 text-xs text-neutral-500">Un pago solo saca plata y baja lo que se debe: no es un gasto nuevo ni mueve el inventario.</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </Modal>
  )
}

/** Voiding asks why (it stays in the record). */
export function ReasonModal({
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
  onClose,
}: {
  title: string
  description: string
  confirmLabel: string
  pending: boolean
  onConfirm: (reason: string) => Promise<void>
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={pending}
            disabled={!reason.trim()}
            onClick={() =>
              void onConfirm(reason.trim()).then(onClose, (err: unknown) => setError(getErrorMessage(err, 'No se pudo anular')))
            }
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <FormField label="Motivo" required>
        {(a11y) => <Input {...a11y} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ej. se registró dos veces" />}
      </FormField>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </Modal>
  )
}

/** ADR 0063: pay the whole balance of several obligations of one payee (one payment each, same date and method). */
export function BatchPayModal({ obligations, onClose, onPaid }: { obligations: Obligation[]; onClose: () => void; onPaid: () => void }) {
  const pay = usePayObligationsBatch()
  const { show } = useToast()
  const [paidOn, setPaidOn] = useState(todayStr())
  const [method, setMethod] = useState<PaymentMethod>('Transferencia')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  const total = obligations.reduce((sum, o) => sum + o.balance, 0)
  const payee = obligations[0]?.payee ?? obligations[0]?.description ?? ''

  async function submit() {
    setError(null)
    try {
      const result = await pay.mutateAsync({ obligationIds: obligations.map((o) => o.id), paidOn, method, reference: reference.trim() || null })
      show(`${result.paid} pago(s) registrados a ${payee} por ${formatMoney(result.amount)}.`)
      onPaid()
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo registrar el pago'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Pagar en lote"
      description={`${payee} · ${obligations.length} obligaciones · ${formatMoney(total)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pay.isPending}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={pay.isPending}>
            Pagar {formatMoney(total)}
          </Button>
        </>
      }
    >
      <ul className="mb-3 max-h-40 space-y-1 overflow-y-auto text-xs text-neutral-400">
        {obligations.map((o) => (
          <li key={o.id} className="flex justify-between gap-3">
            <span className="truncate">{o.description}</span>
            <span className="shrink-0 tabular-nums text-neutral-200">{formatMoney(o.balance)}</span>
          </li>
        ))}
      </ul>
      <FormGrid>
        <FormField label="Fecha del pago" required>
          {(a11y) => <Input {...a11y} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />}
        </FormField>
        <FormField label="Cómo se pagó" required>
          {(a11y) => (
            <Select {...a11y} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Referencia" hint="La misma para todos los pagos (transferencia, recibo…).">
          {(a11y) => <Input {...a11y} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />}
        </FormField>
      </FormGrid>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </Modal>
  )
}

/** ADR 0063: the real amount of a «monto variable» month (the reference is a starting point). */
export function ConfirmAmountModal({ obligation, onClose }: { obligation: Obligation; onClose: () => void }) {
  const confirm = useConfirmObligationAmount()
  const { show } = useToast()
  const [amount, setAmount] = useState<number | null>(obligation.amount)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    try {
      await confirm.mutateAsync({ id: obligation.id, amount: amount! })
      show(`Monto confirmado: ${formatMoney(amount!)}. Ya se puede pagar.`)
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo confirmar el monto'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Confirmar monto"
      description={`${obligation.payee ?? obligation.description} · ${obligation.description}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={confirm.isPending}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={confirm.isPending} disabled={!amount || amount <= 0}>
            Confirmar
          </Button>
        </>
      }
    >
      <FormField label="Valor real de la factura" required hint={`Referencia: ${formatMoney(obligation.amount)}. Cuenta en la rentabilidad con el valor real.`}>
        {(a11y) => <CurrencyInput {...a11y} value={amount} onValueChange={setAmount} autoFocus />}
      </FormField>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </Modal>
  )
}
