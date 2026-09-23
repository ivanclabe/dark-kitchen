import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { formatDateTime, formatMoney } from '@/shared/utils/format'
import { History } from 'lucide-react'
import { useMovements } from '../hooks/useMovements'
import { movementMeta, WASTE_REASON_LABEL } from '../lib/movementVisuals'

/**
 * Línea de tiempo del ledger. Sin `ingredientId` muestra el histórico global
 * (lo que hacía MovementsPage); con él, solo ese insumo — useMovements ya
 * soportaba el filtro y ninguna pantalla lo usaba.
 */
export function MovementTimeline({ ingredientId, showIngredientName = false }: { ingredientId?: string; showIngredientName?: boolean }) {
  const { data: movements, isLoading, isError, error, refetch } = useMovements(ingredientId)

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} compact />
  if (isLoading) return <LoadingState variant="block" className="!border-0 !bg-transparent !p-0" />
  if (!movements || movements.length === 0) {
    return <EmptyState icon={History} title="Sin movimientos" description="Las compras confirmadas, mermas y ajustes aparecerán aquí." compact />
  }

  return (
    <ul className="divide-y divide-neutral-800/60">
      {movements.map((m) => {
        const meta = movementMeta(m.movementType)
        const Icon = meta.icon
        const detail = m.reason ? (WASTE_REASON_LABEL[m.reason] ?? m.reason) : m.observation
        return (
          <li key={m.id} className="flex items-start justify-between gap-3 py-2.5">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className={`mt-0.5 shrink-0 ${meta.color}`}>
                <Icon size={15} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-neutral-200">
                  {meta.label}
                  {showIngredientName && <span className="text-neutral-400"> · {m.ingredientName}</span>}
                </p>
                <p className="truncate text-xs text-neutral-500">
                  {formatDateTime(m.createdAt)}
                  {detail ? ` · ${detail}` : ''}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-sm font-semibold tabular-nums ${m.quantityBaseUnit < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {m.quantityBaseUnit > 0 ? '+' : ''}
                {m.quantityBaseUnit}
              </p>
              {m.unitCost !== null && <p className="text-xs text-neutral-500 tabular-nums">{formatMoney(m.unitCost)}</p>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
