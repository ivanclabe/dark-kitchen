import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { KitchenLink } from '@/shared/kitchen/KitchenLink'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Chip } from '@/shared/ui/Chip'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Modal } from '@/shared/ui/Modal'
import { StatCard } from '@/shared/ui/StatCard'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate, formatMoney, todayStr } from '@/shared/utils/format'
import clsx from 'clsx'
import { Ban, HandCoins, History, Receipt } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAddPreviousPurchases, useObligations, usePayablesSummary, usePreviousPurchases, useVoidObligation } from '../hooks'
import { daysUntil, KIND_LABEL, STATUS_LABEL, STATUS_TONE } from '../lib/finance'
import type { Obligation, ObligationKind } from '../types'
import { PayObligationModal, ReasonModal } from './FinanceDialogs'

type StatusFilter = 'open' | 'overdue' | 'paid' | 'voided' | 'all'
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Por pagar' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'paid', label: 'Pagadas' },
  { value: 'voided', label: 'Anuladas' },
  { value: 'all', label: 'Todas' },
]

/** What the business owes (ADR 0051, D1): to suppliers, expenses and payroll, with what is overdue first. */
export function PayablesTab() {
  const { can } = useActiveKitchen()
  const summary = usePayablesSummary()
  const obligations = useObligations()
  const voidObligation = useVoidObligation()
  const [status, setStatus] = useState<StatusFilter>('open')
  const [kind, setKind] = useState<ObligationKind | 'all'>('all')
  const [paying, setPaying] = useState<Obligation | null>(null)
  const [voiding, setVoiding] = useState<Obligation | null>(null)
  const [previousOpen, setPreviousOpen] = useState(false)
  const today = todayStr()

  const rows = useMemo(
    () =>
      (obligations.data ?? []).filter((o) => {
        if (kind !== 'all' && o.kind !== kind) return false
        if (status === 'open') return o.balance > 0 && o.status !== 'voided'
        if (status === 'overdue') return o.status === 'overdue'
        if (status === 'paid') return o.status === 'paid'
        if (status === 'voided') return o.status === 'voided'
        return true
      }),
    [obligations.data, status, kind],
  )

  const s = summary.data
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Por pagar" value={s ? formatMoney(s.total) : '—'} hint={s ? `${s.count} obligación(es)` : undefined} icon={Receipt} emphasis />
        <StatCard label="Vencido" value={s ? formatMoney(s.overdue) : '—'} tone={s && s.overdue > 0 ? 'warn' : 'neutral'} />
        <StatCard label="Vence en 7 días" value={s ? formatMoney(s.next7Days) : '—'} />
      </div>

      {s && s.previousPurchases > 0 && can('finance.manage') && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm text-sky-200">
          <p className="flex items-center gap-2">
            <History size={15} aria-hidden /> Hay {s.previousPurchases} compra(s) confirmada(s) antes de Finanzas. Agrega las que todavía debes.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setPreviousOpen(true)}>
            Agregar compras anteriores
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} active={status === f.value} onClick={() => setStatus(f.value)} />
        ))}
        <span className="mx-1 h-5 w-px bg-neutral-800" aria-hidden />
        {(['all', 'purchase', 'expense', 'payroll'] as const)
          .filter((k) => k !== 'payroll' || can('finance.payroll'))
          .map((k) => (
            <Chip key={k} label={k === 'all' ? 'Todo' : k === 'purchase' ? 'Proveedores' : k === 'expense' ? 'Gastos' : 'Nómina'} active={kind === k} onClick={() => setKind(k)} />
          ))}
      </div>

      {obligations.isError ? (
        <ErrorState error={obligations.error} onRetry={() => void obligations.refetch()} />
      ) : obligations.isLoading ? (
        <LoadingState variant="block" label="Cargando lo que se debe…" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Receipt} mood={status === 'open' ? 'success' : undefined} title={status === 'open' ? 'No se debe nada' : 'Nada por aquí'} description="Las compras confirmadas, los gastos y las nóminas aparecen aquí." compact />
      ) : (
        <ul className="divide-y divide-neutral-800/60 rounded-xl border border-neutral-800/60">
          {rows.map((o) => {
            const days = daysUntil(o.dueDate, today)
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="truncate font-medium text-neutral-100">{o.payee ?? o.description}</span>
                    <Badge tone="neutral">{o.kind === 'expense' ? (o.categoryName ?? KIND_LABEL.expense) : KIND_LABEL[o.kind]}</Badge>
                    <Badge tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {o.purchaseId ? (
                      <KitchenLink to={`/supply/compras/${o.purchaseId}`} className="hover:text-neutral-300 hover:underline">
                        {o.description}
                      </KitchenLink>
                    ) : (
                      o.description
                    )}
                    {' · '}
                    <span className={clsx(o.balance > 0 && days < 0 && 'text-red-400')}>
                      {o.balance > 0 ? (days < 0 ? `venció hace ${-days} día(s)` : days === 0 ? 'vence hoy' : `vence el ${formatDate(o.dueDate)}`) : `vencía el ${formatDate(o.dueDate)}`}
                    </span>
                    {o.voidReason && <> · anulada: {o.voidReason}</>}
                  </p>
                </div>
                <div className="text-right text-sm tabular-nums">
                  <p className="font-semibold text-neutral-100">{formatMoney(o.balance > 0 ? o.balance : o.amount)}</p>
                  {o.paid > 0 && o.balance > 0 && <p className="text-xs text-neutral-500">de {formatMoney(o.amount)}</p>}
                </div>
                <div className="flex gap-1.5">
                  {o.balance > 0 && o.status !== 'voided' && can('finance.pay') && (o.kind !== 'payroll' || can('finance.payroll')) && (
                    <Button variant="secondary" size="sm" icon={HandCoins} onClick={() => setPaying(o)}>
                      Pagar
                    </Button>
                  )}
                  {o.kind !== 'purchase' && o.status !== 'voided' && o.paid === 0 && can('finance.manage') && (
                    <Button variant="ghost" size="sm" icon={Ban} onClick={() => setVoiding(o)} className="!text-neutral-400 hover:!text-red-400" aria-label={`Anular ${o.description}`}>
                      Anular
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {paying && <PayObligationModal obligation={paying} onClose={() => setPaying(null)} />}
      {voiding && (
        <ReasonModal
          title="Anular obligación"
          description={`${voiding.description} · ${formatMoney(voiding.amount)}. Sale de lo que se debe y de la rentabilidad; queda en el registro.`}
          confirmLabel="Anular"
          pending={voidObligation.isPending}
          onConfirm={(reason) => voidObligation.mutateAsync({ id: voiding.id, reason })}
          onClose={() => setVoiding(null)}
        />
      )}
      {previousOpen && <PreviousPurchasesModal onClose={() => setPreviousOpen(false)} />}
    </div>
  )
}

/** ADR 0051 (D4): purchases confirmed before Finanzas become debts only if the person says they are still owed. */
function PreviousPurchasesModal({ onClose }: { onClose: () => void }) {
  const purchases = usePreviousPurchases(true)
  const add = useAddPreviousPurchases()
  const { show } = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Compras anteriores que todavía debes"
      description="Marca solo las que no has pagado. Las demás no se vuelven deuda."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={add.isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={add.isPending}
            disabled={selected.size === 0}
            onClick={() =>
              void add.mutateAsync([...selected]).then(
                (n) => {
                  show(`${n} compra(s) agregada(s) a lo que se debe.`)
                  onClose()
                },
                (err: unknown) => setError(getErrorMessage(err, 'No se pudieron agregar')),
              )
            }
          >
            Agregar {selected.size || ''}
          </Button>
        </>
      }
    >
      {purchases.isLoading ? (
        <LoadingState variant="block" label="Cargando compras…" />
      ) : (
        <ul className="max-h-96 space-y-1 overflow-y-auto">
          {(purchases.data ?? []).map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-neutral-900">
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="accent-brasa-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-neutral-100">{p.supplierName}</span>
                  <span className="text-xs text-neutral-500">
                    #{p.invoiceNumber} · {formatDate(p.invoiceDate)}
                  </span>
                </span>
                <span className="tabular-nums text-neutral-200">{formatMoney(p.total)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </Modal>
  )
}
