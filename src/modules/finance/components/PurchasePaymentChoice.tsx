import { FormField, Input, Select } from '@/shared/ui/FormField'
import clsx from 'clsx'
import { PAYMENT_METHODS, type PaymentMethod, type PurchasePayment } from '../types'

/**
 * «¿Cómo se pagó?» when confirming a purchase (ADR 0051, D3): cash (paid now,
 * with its method) or on credit (falls due on a date, by default the invoice
 * date plus the supplier's term). Either way the profit is the same: only
 * when the money leaves changes.
 */
export function PurchasePaymentChoice({ value, onChange }: { value: PurchasePayment; onChange: (next: PurchasePayment) => void }) {
  const option = (mode: 'cash' | 'credit', label: string, hint: string) => (
    <label
      className={clsx(
        'flex flex-1 cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-sm',
        value.mode === mode ? 'border-brasa-500/60 bg-brasa-500/5 text-neutral-100' : 'border-neutral-800 text-neutral-300 hover:border-neutral-700',
      )}
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name="purchase-payment"
          checked={value.mode === mode}
          onChange={() => onChange(mode === 'cash' ? { mode: 'cash', method: 'Efectivo' } : { mode: 'credit', dueDate: value.mode === 'credit' ? value.dueDate : undefined })}
          className="accent-brasa-500"
        />
        {label}
      </span>
      <span className="pl-5 text-xs text-neutral-500">{hint}</span>
    </label>
  )

  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-medium text-neutral-200">¿Cómo se pagó?</legend>
      <div className="flex flex-col gap-2 sm:flex-row">
        {option('cash', 'De contado', 'Ya se pagó: queda registrado el pago')}
        {option('credit', 'A crédito', 'Queda en Finanzas → Por pagar')}
      </div>
      {value.mode === 'cash' ? (
        <FormField label="Cómo se pagó">
          {(a11y) => (
            <Select {...a11y} value={value.method} onChange={(e) => onChange({ ...value, method: e.target.value as PaymentMethod })}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          )}
        </FormField>
      ) : (
        <FormField label="Vence" hint="Por defecto, la fecha de la factura más el plazo del proveedor">
          {(a11y) => <Input {...a11y} type="date" value={value.dueDate ?? ''} onChange={(e) => onChange({ mode: 'credit', dueDate: e.target.value || undefined })} />}
        </FormField>
      )}
    </fieldset>
  )
}
