import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { StatCard } from '@/shared/ui/StatCard'
import { formatDate, formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { ArrowDownLeft, ArrowUpRight, Ban, Info, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useCashflow, useObligationsByIds, usePayments, useVoidPayment } from '../hooks'
import { KIND_LABEL } from '../lib/finance'
import { usePeriod } from '../lib/usePeriod'
import type { ObligationPayment } from '../types'
import { PeriodSelect, ReasonModal } from './FinanceDialogs'

/** Every payment out (ADR 0051, D2): an append-only record; a mistake is voided with its reason. */
export function PaymentsTab() {
  const { can } = useActiveKitchen()
  const [period, setPeriod] = usePeriod('month')
  const payments = usePayments(period.range.from, period.range.to)
  const ids = useMemo(() => [...new Set((payments.data ?? []).map((p) => p.obligationId))], [payments.data])
  const obligations = useObligationsByIds(ids)
  const byId = useMemo(() => new Map((obligations.data ?? []).map((o) => [o.id, o])), [obligations.data])
  const voidPayment = useVoidPayment()
  const [voiding, setVoiding] = useState<ObligationPayment | null>(null)
  const voided = new Set((payments.data ?? []).filter((p) => p.voidsPaymentId).map((p) => p.voidsPaymentId))

  return (
    <div className="space-y-4">
      <PeriodSelect value={period} onChange={setPeriod} />
      {payments.isError ? (
        <ErrorState error={payments.error} onRetry={() => void payments.refetch()} />
      ) : payments.isLoading ? (
        <LoadingState variant="block" label="Cargando pagos…" />
      ) : (payments.data ?? []).length === 0 ? (
        <EmptyState icon={Wallet} title="Sin pagos en el periodo" description="Los pagos se registran desde Por pagar, o al confirmar una compra de contado." compact />
      ) : (
        <ul className="divide-y divide-neutral-800/60 rounded-xl border border-neutral-800/60">
          {(payments.data ?? []).map((p) => {
            const o = byId.get(p.obligationId)
            const isVoid = p.amount < 0
            return (
              <li key={p.id} className={clsx('flex flex-wrap items-center gap-3 px-4 py-3', (isVoid || voided.has(p.id)) && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="truncate font-medium text-neutral-100">{o?.payee ?? o?.description ?? 'Obligación'}</span>
                    {o && <Badge tone="neutral">{KIND_LABEL[o.kind]}</Badge>}
                    {isVoid && <Badge tone="warning">Anulación</Badge>}
                    {voided.has(p.id) && <Badge tone="neutral">Anulado</Badge>}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {formatDate(p.paidOn)} · {p.method}
                    {p.reference && ` · ${p.reference}`}
                    {o && ` · ${o.description}`}
                    {p.note && ` · ${p.note}`}
                  </p>
                </div>
                <p className={clsx('text-sm font-semibold tabular-nums', isVoid ? 'text-amber-400' : 'text-neutral-100')}>{formatMoney(p.amount)}</p>
                {!isVoid && !voided.has(p.id) && can('finance.pay') && (
                  <Button variant="ghost" size="sm" icon={Ban} onClick={() => setVoiding(p)} className="!text-neutral-400 hover:!text-red-400" aria-label="Anular pago">
                    Anular
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {voiding && (
        <ReasonModal
          title="Anular pago"
          description={`${formatMoney(voiding.amount)} del ${formatDate(voiding.paidOn)}. Se registra una anulación y lo que se debía vuelve a quedar pendiente.`}
          confirmLabel="Anular pago"
          pending={voidPayment.isPending}
          onConfirm={(reason) => voidPayment.mutateAsync({ id: voiding.id, reason })}
          onClose={() => setVoiding(null)}
        />
      )}
    </div>
  )
}

/** Cash in (collections) and out (payments), apart from profit (ADR 0051, D11). */
export function CashflowTab() {
  const [period, setPeriod] = usePeriod('month')
  const cash = useCashflow(period.range.from, period.range.to)
  const data = cash.data
  const activeDays = (data?.days ?? []).filter((d) => d.in !== 0 || d.out !== 0)

  return (
    <div className="space-y-4">
      <PeriodSelect value={period} onChange={setPeriod} />
      {cash.isError ? (
        <ErrorState error={cash.error} onRetry={() => void cash.refetch()} />
      ) : cash.isLoading || !data ? (
        <LoadingState variant="block" label="Calculando el flujo de caja…" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Entró" value={formatMoney(data.in)} hint="Cobros de pedidos" icon={ArrowDownLeft} tone="good" />
            <StatCard label="Salió" value={formatMoney(data.out)} hint="Pagos a proveedores, gastos y nómina" icon={ArrowUpRight} />
            <StatCard label="Neto" value={formatMoney(data.net)} tone={data.net < 0 ? 'warn' : 'good'} emphasis />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Salidas por tipo">
              <dl className="space-y-1.5 text-sm">
                {(['purchase', 'expense', 'payroll'] as const)
                  .filter((k) => k !== 'payroll' || data.payrollVisible)
                  .map((k) => (
                    <div key={k} className="flex justify-between">
                      <dt className="text-neutral-400">{k === 'purchase' ? 'Proveedores' : k === 'expense' ? 'Gastos' : 'Nómina'}</dt>
                      <dd className="tabular-nums text-neutral-100">{formatMoney(data.outByKind[k])}</dd>
                    </div>
                  ))}
              </dl>
            </Card>
            <Card title="Por método">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-neutral-500">
                    <th className="pb-1 text-left font-normal">Método</th>
                    <th className="pb-1 text-right font-normal">Entró</th>
                    <th className="pb-1 text-right font-normal">Salió</th>
                  </tr>
                </thead>
                <tbody>
                  {[...new Set([...Object.keys(data.inByMethod), ...Object.keys(data.outByMethod)])].map((m) => (
                    <tr key={m}>
                      <td className="py-1 text-neutral-300">{m}</td>
                      <td className="py-1 text-right tabular-nums text-neutral-100">{formatMoney(data.inByMethod[m] ?? 0)}</td>
                      <td className="py-1 text-right tabular-nums text-neutral-100">{formatMoney(data.outByMethod[m] ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
          <Card title="Día por día" padding={false}>
            {activeDays.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-neutral-500">Sin movimientos de caja en el periodo.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800/60 text-xs text-neutral-500">
                    <th className="px-5 py-2 text-left font-normal">Día</th>
                    <th className="px-5 py-2 text-right font-normal">Entró</th>
                    <th className="px-5 py-2 text-right font-normal">Salió</th>
                    <th className="px-5 py-2 text-right font-normal">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDays.map((d) => (
                    <tr key={d.day} className="border-b border-neutral-800/40">
                      <td className="px-5 py-1.5 text-neutral-300">{formatDate(d.day)}</td>
                      <td className="px-5 py-1.5 text-right tabular-nums">{formatMoney(d.in)}</td>
                      <td className="px-5 py-1.5 text-right tabular-nums">{formatMoney(d.out)}</td>
                      <td className={clsx('px-5 py-1.5 text-right tabular-nums', d.in - d.out < 0 ? 'text-red-400' : 'text-emerald-400')}>{formatMoney(d.in - d.out)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <p className="flex items-start gap-2 text-xs text-neutral-500">
            <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
            La caja no es la utilidad: una compra a crédito cuesta cuando se usa pero sale de la caja cuando se paga, y una venta fiada entra a la caja cuando se cobra.
          </p>
        </>
      )}
    </div>
  )
}
