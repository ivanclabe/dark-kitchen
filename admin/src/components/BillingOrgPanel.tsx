import { Button } from '@/shared/ui/Button'
import { ErrorState } from '@/shared/ui/ErrorState'
import { FormField, Input, Select, Textarea } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatMoney } from '@/shared/utils/format'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, FileText, RotateCw, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { fetchPlans } from '../lib/api'
import {
  fetchOrgBilling,
  MODE_LABEL,
  receiptUrl,
  recordRefund,
  recordTransfer,
  retryCharge,
  setBillingMode,
  SUBSCRIPTION_LABEL,
  type BillingMode,
  type OrgBillingInvoice,
} from '../lib/billing'
import { formatDateTimeShort, formatShortDate } from '../lib/format'
import { Panel, StatusPill } from './ui'

const KIND: Record<string, string> = { activation: 'Activación', renewal: 'Renovación', upgrade: 'Cambio de plan', transfer: 'Transferencia' }
const INVOICE_TONE = { paid: 'good', open: 'warn', void: 'neutral', draft: 'neutral', uncollectible: 'bad' } as const

/**
 * The subscription of one organization (ADR 0066 §6-7): its state and invoices with
 * every Wompi attempt; recording a transfer (Enterprise), a refund, and charging
 * the saved card again.
 */
export function BillingOrgPanel({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const key = ['ga', 'organization', organizationId, 'billing']
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: key, queryFn: () => fetchOrgBilling(organizationId) })
  const [transferOpen, setTransferOpen] = useState(false)
  const [refundOf, setRefundOf] = useState<OrgBillingInvoice | null>(null)

  const done = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: ['ga'] })
    show(message)
  }
  const mode = useMutation({
    mutationFn: (m: BillingMode) => setBillingMode(organizationId, m),
    onSuccess: () => done('Modo de cobro actualizado.'),
    onError: (err) => show(getErrorMessage(err, 'No se pudo cambiar el modo'), 'error'),
  })
  const retry = useMutation({
    mutationFn: (invoiceId: string) => retryCharge(invoiceId),
    onSuccess: () => done('Cobro programado: se intenta en unos segundos.'),
    onError: (err) => show(getErrorMessage(err, 'No se pudo reintentar'), 'error'),
  })

  if (isLoading) return <LoadingState variant="cards" rows={1} cols={3} />
  if (isError || !data) return <ErrorState error={error} onRetry={() => void refetch()} />
  const s = data.subscription

  return (
    <div className="space-y-4">
      <Panel
        title="Suscripción"
        actions={
          <Button variant="secondary" size="sm" icon={Banknote} onClick={() => setTransferOpen(true)}>
            Registrar transferencia
          </Button>
        }
      >
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-neutral-500">Estado</dt>
            <dd className="mt-0.5 flex items-center gap-2 text-neutral-100">
              {SUBSCRIPTION_LABEL[s.status] ?? s.status}
              <StatusPill tone={s.isCurrent ? 'good' : 'bad'}>{s.isCurrent ? 'Con acceso' : 'Sin acceso si se bloquea'}</StatusPill>
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Plan</dt>
            <dd className="mt-0.5 text-neutral-100">
              {s.planKey} · {s.billingPeriod === 'annual' ? 'anual' : 'mensual'}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">{s.cancelAtPeriodEnd ? 'Termina' : 'Vence'}</dt>
            <dd className="mt-0.5 text-neutral-100">
              {s.currentPeriodEnd ? formatShortDate(s.currentPeriodEnd) : '—'}
              {s.graceEndsAt && <span className="text-amber-300"> · gracia hasta {formatShortDate(s.graceEndsAt)}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Método guardado</dt>
            <dd className="mt-0.5 text-neutral-100">{s.paymentMethod ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Correo de cobro</dt>
            <dd className="mt-0.5 truncate text-neutral-100">{s.customerEmail ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Modo de cobro</dt>
            <dd className="mt-0.5">
              <Select aria-label="Modo de cobro" value={s.mode} disabled={mode.isPending} onChange={(e) => mode.mutate(e.target.value as BillingMode)} className="!mt-0 w-auto">
                {(Object.keys(MODE_LABEL) as BillingMode[]).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </Select>
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-neutral-500">Exenta: nunca se bloquea ni se cobra (organizaciones anteriores o acuerdos especiales). Transferencia: la renueva quien registra cada pago aquí.</p>
      </Panel>

      <Panel title="Facturas y pagos" subtitle="Cada intento con su referencia y la respuesta de Wompi">
        {data.invoices.length === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-500">Sin facturas todavía.</p>
        ) : (
          <ul className="divide-y divide-console-800">
            {data.invoices.map((i) => (
              <li key={i.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-sm text-neutral-100">{i.number}</span>
                  <StatusPill tone={INVOICE_TONE[i.status]}>{i.status}</StatusPill>
                  <span className="text-xs text-neutral-400">
                    {i.kind ? KIND[i.kind] : '—'} · {i.planKey} {i.billingPeriod === 'annual' ? 'anual' : 'mensual'}
                  </span>
                  <span className="ml-auto text-sm text-neutral-100 tabular-nums">
                    {formatMoney(i.amount)} {i.currency}
                    {i.refundedAmount > 0 && <span className="text-amber-300"> · reembolsado {formatMoney(i.refundedAmount)}</span>}
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Emitida {formatShortDate(i.issuedAt)}
                  {i.dueAt && ` · vence ${formatShortDate(i.dueAt)}`}
                  {i.paidAt && ` · pagada ${formatShortDate(i.paidAt)}${i.method ? ` (${i.method})` : ''}`}
                  {i.status === 'open' && i.kind === 'renewal' && ` · intentos ${i.attempts}${i.nextAttemptAt ? `, próximo ${formatDateTimeShort(i.nextAttemptAt)}` : ''}`}
                </p>
                {i.notes && <p className="mt-1 whitespace-pre-line text-xs text-neutral-400">{i.notes}</p>}
                {i.payments.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-neutral-400">
                    {i.payments.map((p) => (
                      <li key={p.reference} className="flex flex-wrap gap-x-2">
                        <span className="font-mono">{p.reference}</span>
                        <span>{p.status}</span>
                        {p.method && <span>{p.method}</span>}
                        {p.automatic && <span>· automático</span>}
                        {p.transactionId && <span className="font-mono text-neutral-500">· {p.transactionId}</span>}
                        {p.message && <span className="text-amber-300">· {p.message}</span>}
                        <span className="text-neutral-600">· {formatDateTimeShort(p.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {i.supportPath && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={FileText}
                      onClick={() => {
                        // Safari blocks a window opened after an await: the tab opens now, the file arrives after.
                        const tab = window.open('', '_blank')
                        receiptUrl(i.supportPath!)
                          .then((u) => {
                            if (tab) {
                              tab.opener = null
                              tab.location.href = u
                            }
                          })
                          .catch((e) => {
                            tab?.close()
                            show(getErrorMessage(e, 'No se pudo abrir el soporte'), 'error')
                          })
                      }}
                    >
                      Ver soporte
                    </Button>
                  )}
                  {i.status === 'open' && i.kind === 'renewal' && s.paymentMethod && (
                    <Button variant="ghost" size="sm" icon={RotateCw} loading={retry.isPending} onClick={() => retry.mutate(i.id)}>
                      Cobrar de nuevo
                    </Button>
                  )}
                  {i.status === 'paid' && (
                    <Button variant="ghost" size="sm" icon={Undo2} onClick={() => setRefundOf(i)}>
                      Registrar reembolso
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {transferOpen && <TransferDialog organizationId={organizationId} planKey={s.planKey} period={s.billingPeriod} onClose={() => setTransferOpen(false)} onDone={() => void done('Transferencia registrada: la suscripción quedó activa.')} />}
      {refundOf && <RefundDialog invoice={refundOf} onClose={() => setRefundOf(null)} onDone={() => void done('Reembolso registrado.')} />}
    </div>
  )
}

function TransferDialog({
  organizationId,
  planKey,
  period,
  onClose,
  onDone,
}: {
  organizationId: string
  planKey: string
  period: 'monthly' | 'annual'
  onClose: () => void
  onDone: () => void
}) {
  const plans = useQuery({ queryKey: ['ga', 'plans'], queryFn: fetchPlans })
  const [plan, setPlan] = useState(planKey)
  const [billingPeriod, setBillingPeriod] = useState(period)
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => recordTransfer({ organizationId, amount: Number(amount.replace(/\D/g, '')), paidOn, planKey: plan, billingPeriod, note, receipt }),
    onSuccess: () => {
      onDone()
      onClose()
    },
    onError: (err) => setError(getErrorMessage(err, 'No se pudo registrar')),
  })
  return (
    <Modal open onClose={onClose} title="Registrar transferencia" description="La factura queda pagada con su soporte y la suscripción activa por el período. Verifica el dinero en el banco antes de registrarlo.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!Number(amount.replace(/\D/g, ''))) return setError('Escribe el valor recibido')
          save.mutate()
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Plan" required>
            {(a) => (
              <Select {...a} value={plan} onChange={(e) => setPlan(e.target.value)}>
                {(plans.data ?? [{ key: planKey, name: planKey }]).map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Período" required>
            {(a) => (
              <Select {...a} value={billingPeriod} onChange={(e) => setBillingPeriod(e.target.value as 'monthly' | 'annual')}>
                <option value="monthly">Mensual</option>
                <option value="annual">Anual</option>
              </Select>
            )}
          </FormField>
          <FormField label="Valor recibido (COP)" required>
            {(a) => <Input {...a} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="2499000" />}
          </FormField>
          <FormField label="Fecha del pago" required>
            {(a) => <Input {...a} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />}
          </FormField>
        </div>
        <FormField label="Soporte (PDF o imagen)" hint="Queda privado: solo la plataforma lo ve.">
          {(a) => <Input {...a} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />}
        </FormField>
        <FormField label="Nota">
          {(a) => <Textarea {...a} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Banco, número de comprobante…" />}
        </FormField>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" loading={save.isPending}>
            Registrar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function RefundDialog({ invoice, onClose, onDone }: { invoice: OrgBillingInvoice; onClose: () => void; onDone: () => void }) {
  const left = invoice.amount - invoice.refundedAmount
  const [amount, setAmount] = useState(String(left))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => recordRefund(invoice.id, Number(amount), note),
    onSuccess: () => {
      onDone()
      onClose()
    },
    onError: (err) => setError(getErrorMessage(err, 'No se pudo registrar')),
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={`Reembolso de ${invoice.number}`}
      description="Primero haz el reembolso en el panel de Wompi (o por transferencia); aquí solo se registra. Si es total, la suscripción de ese período se cancela."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <FormField label={`Valor reembolsado (hasta ${formatMoney(left)})`} required>
          {(a) => <Input {...a} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />}
        </FormField>
        <FormField label="Motivo">
          {(a) => <Textarea {...a} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
        </FormField>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" type="submit" loading={save.isPending}>
            Registrar reembolso
          </Button>
        </div>
      </form>
    </Modal>
  )
}
