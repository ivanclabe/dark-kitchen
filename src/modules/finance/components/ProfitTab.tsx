import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { AlertTriangle, Calculator, Info, Lock } from 'lucide-react'
import { usePnl, useSetVatDeductible } from '../hooks'
import { coverageNotes, statementRows } from '../lib/finance'
import { usePeriod } from '../lib/usePeriod'
import { PeriodSelect } from './FinanceDialogs'

const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`)

/**
 * The real profit (ADR 0051, D8): a statement, line by line, each one saying
 * where it comes from. Purchases and payments are not in it: ingredients
 * cost when they are used, expenses on their date or period.
 */
export function ProfitTab() {
  const { can } = useActiveKitchen()
  const allowed = can('reports.profitability')
  const [period, setPeriod] = usePeriod('month')
  const pnl = usePnl(period.range.from, period.range.to, allowed)
  const setVat = useSetVatDeductible()
  const { show } = useToast()

  if (!allowed) {
    return <EmptyState icon={Lock} title="Sin acceso a la rentabilidad" description="Ver costos y utilidad necesita el permiso de rentabilidad (Insights)." />
  }

  const data = pnl.data
  const rows = data ? statementRows(data) : []
  const notes = data ? coverageNotes(data) : []

  return (
    <div className="space-y-4">
      <PeriodSelect value={period} onChange={setPeriod} />
      {pnl.isError ? (
        <ErrorState error={pnl.error} onRetry={() => void pnl.refetch()} />
      ) : pnl.isLoading || !data ? (
        <LoadingState variant="block" label="Calculando la rentabilidad…" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card title="Estado de resultados" icon={Calculator} padding={false}>
            <table className="w-full text-sm">
              <caption className="sr-only">Estado de resultados del periodo</caption>
              <tbody>
                {rows.map((r) => (
                  <RowGroup key={r.key} row={r} />
                ))}
              </tbody>
            </table>
          </Card>

          <div className="space-y-4">
            {notes.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
                <p className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle size={14} aria-hidden /> Para que la utilidad sea completa
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-200/90">
                  {notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="space-y-2 rounded-xl border border-neutral-800/60 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-300">
              <p className="flex items-center gap-1.5 font-medium text-neutral-100">
                <Info size={14} aria-hidden /> Cómo se calcula
              </p>
              <ul className="list-disc space-y-1 pl-5 text-neutral-400">
                <li>Las <strong className="text-neutral-200">compras no son gasto</strong>: el insumo cuesta cuando se usa en un plato vendido, o cuando se pierde (merma o ajuste).</li>
                <li>Los <strong className="text-neutral-200">pagos no son gasto</strong>: el gasto cuenta en su fecha o periodo. Pagar solo baja lo que se debe.</li>
                <li>Por eso comprar a crédito o de contado da la misma utilidad: solo cambia cuándo sale la plata (ver Flujo de caja).</li>
                <li>Ventas: pedidos confirmados del periodo. Los que no se confirmaron no cuentan, igual que en Insights.</li>
              </ul>
            </div>
            {can('finance.manage') && (
              <label className="flex items-start justify-between gap-3 rounded-xl border border-neutral-800/60 px-4 py-3 text-sm text-neutral-300">
                <span>
                  <span className="block font-medium text-neutral-100">Descuento el IVA de mis compras</span>
                  <span className="block text-xs text-neutral-500">
                    Apagado (lo normal en una cocina pequeña), el IVA que pagas en las compras es un costo. Encendido, no cuenta: lo recuperas en tu declaración.
                  </span>
                </span>
                <Switch
                  checked={data.purchaseVatDeductible}
                  label="Descuento el IVA de mis compras"
                  disabled={setVat.isPending}
                  onChange={(v) => setVat.mutate(v, { onSuccess: () => show(v ? 'El IVA de las compras ya no cuenta como costo.' : 'El IVA de las compras cuenta como costo.') })}
                />
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function RowGroup({ row }: { row: ReturnType<typeof statementRows>[number] }) {
  const strong = row.kind !== 'line'
  return (
    <>
      <tr className={clsx('border-b border-neutral-800/60', row.kind === 'total' && 'bg-neutral-900/60')}>
        <td className="px-5 py-2.5 align-top">
          <span className={clsx(strong ? 'font-semibold text-neutral-100' : 'text-neutral-300', row.kind === 'total' && 'text-base')}>{row.label}</span>
          {row.source && <span className="mt-0.5 block text-xs text-neutral-500">{row.source}</span>}
        </td>
        <td className="px-5 py-2.5 text-right align-top whitespace-nowrap tabular-nums">
          <span
            className={clsx(
              strong ? 'font-semibold' : '',
              row.kind === 'total' ? (row.amount < 0 ? 'text-base text-red-400' : 'text-base text-emerald-400') : row.amount < 0 ? 'text-neutral-300' : 'text-neutral-100',
            )}
          >
            {row.kind === 'line' && row.amount > 0 && row.key !== 'grossSales' ? '+' : ''}
            {formatMoney(row.amount)}
          </span>
          {row.margin !== undefined && <span className="block text-xs text-neutral-500">margen {pct(row.margin)}</span>}
        </td>
      </tr>
      {row.children?.map((c) => (
        <tr key={c.key} className="border-b border-neutral-800/40">
          <td className="py-1.5 pr-5 pl-9 text-xs text-neutral-400">{c.label}</td>
          <td className="px-5 py-1.5 text-right text-xs whitespace-nowrap text-neutral-400 tabular-nums">{formatMoney(c.amount)}</td>
        </tr>
      ))}
    </>
  )
}
