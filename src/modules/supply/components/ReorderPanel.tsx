import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { StatCard } from '@/shared/ui/StatCard'
import { Tooltip } from '@/shared/ui/Tooltip'
import { typography } from '@/shared/ui/typography'
import { formatMoney } from '@/shared/utils/format'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, History, PackagePlus, Settings2, Trash2, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { useIngredients } from '../hooks/useIngredients'
import { useSupplySuggestions } from '../hooks/useSuggestions'
import { formatCoverage, needsAttention, orderQuantity, SHORT_COVERAGE_DAYS, urgencyOf } from '../lib/coverage'
import { inventoryValue } from '../lib/stock'
import type { SupplySuggestion } from '../types'
import type { PresetLine } from './NewPurchaseDialog'
import { MovementTimeline } from './MovementTimeline'

function UrgencyBadge({ suggestion }: { suggestion: SupplySuggestion }) {
  const urgency = urgencyOf(suggestion)
  if (urgency === 'bajo_minimo')
    return (
      <Badge tone="danger" icon={AlertTriangle} size="sm">
        Bajo mínimo
      </Badge>
    )
  if (urgency === 'cobertura_corta')
    return (
      <Badge tone="warning" icon={Clock} size="sm">
        {formatCoverage(suggestion)}
      </Badge>
    )
  if (urgency === 'sin_meta')
    return (
      <Badge tone="neutral" icon={Settings2} size="sm">
        Sin mín./máx.
      </Badge>
    )
  return null
}

/**
 * Estado por defecto de la vista Stock: salud del inventario y qué reponer.
 * A diferencia de la versión anterior (solo la regla estática
 * stock <= mínimo), ahora lee dk_supply_suggestions, que agrega el ritmo de
 * consumo real del ledger — así aparecen también los insumos que todavía
 * están por encima del mínimo pero se acaban esta semana.
 */
export function ReorderPanel({
  onSelectIngredient,
  onCreatePurchaseFor,
}: {
  onSelectIngredient: (ingredientId: string) => void
  onCreatePurchaseFor: (supplierId: string | null, lines: PresetLine[]) => void
}) {
  const { data: suggestions, isLoading, isError, error, refetch } = useSupplySuggestions()
  const { data: ingredients } = useIngredients()

  const active = useMemo(() => (ingredients ?? []).filter((i) => i.active), [ingredients])
  const attention = useMemo(() => (suggestions ?? []).filter(needsAttention), [suggestions])
  const wasted30d = useMemo(() => (suggestions ?? []).reduce((sum, s) => sum + s.wasted30d * s.avgCost, 0), [suggestions])

  const bySupplier = useMemo(() => {
    const map = new Map<string, { supplierId: string | null; supplierName: string; items: SupplySuggestion[] }>()
    for (const s of attention) {
      const key = s.primarySupplierId ?? 'SIN_PROVEEDOR'
      const entry = map.get(key)
      if (entry) entry.items.push(s)
      else map.set(key, { supplierId: s.primarySupplierId, supplierName: s.supplierName ?? 'Sin proveedor asignado', items: [s] })
    }
    return [...map.values()].sort((a, b) => b.items.length - a.items.length)
  }, [attention])

  /** El diálogo necesita el Ingredient completo (baseUnitId, avgCost); la cantidad la decide orderQuantity. */
  function toLines(items: SupplySuggestion[]): PresetLine[] {
    return items
      .map((s) => {
        const ingredient = active.find((i) => i.id === s.ingredientId)
        return ingredient ? { ingredient, quantity: orderQuantity(s) } : null
      })
      .filter((l): l is PresetLine => l !== null)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Valor del inventario" value={formatMoney(inventoryValue(active))} hint={`${active.length} insumos activos`} icon={Wallet} tone="brand" emphasis />
        <StatCard
          label="Piden atención"
          value={attention.length}
          hint={attention.length > 0 ? `Bajo mínimo o < ${SHORT_COVERAGE_DAYS} días` : 'Todo con cobertura suficiente'}
          icon={attention.length > 0 ? AlertTriangle : CheckCircle2}
          tone={attention.length > 0 ? 'warn' : 'good'}
        />
        <StatCard label="Merma (30 días)" value={formatMoney(wasted30d)} hint="Valorizada al costo promedio" icon={Trash2} tone={wasted30d > 0 ? 'warn' : 'neutral'} />
      </div>

      <Card title="Reponer" description={`Bajo mínimo o con menos de ${SHORT_COVERAGE_DAYS} días de cobertura, agrupado por proveedor`} icon={PackagePlus}>
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} compact />
        ) : isLoading ? (
          <LoadingState variant="block" className="!border-0 !bg-transparent !p-0" />
        ) : attention.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nada por reponer" description="Ningún insumo activo está bajo mínimo ni se queda corto esta semana." compact />
        ) : (
          <div className="space-y-5">
            {bySupplier.map((group) => {
              const orderable = group.items.filter((s) => orderQuantity(s) > 0)
              return (
                <div key={group.supplierId ?? 'SIN_PROVEEDOR'}>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <p className={typography.overline}>{group.supplierName}</p>
                    <Tooltip label={orderable.length === 0 ? 'Configura mín./máx. o registra consumo para poder sugerir cantidades' : 'Crea un borrador con las cantidades sugeridas'} side="top">
                      <span>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={PackagePlus}
                          disabled={orderable.length === 0}
                          onClick={() => onCreatePurchaseFor(group.supplierId, toLines(orderable))}
                        >
                          Crear compra ({orderable.length})
                        </Button>
                      </span>
                    </Tooltip>
                  </div>
                  <ul className="divide-y divide-neutral-800/60">
                    {group.items.map((s) => {
                      const qty = orderQuantity(s)
                      return (
                        <li key={s.ingredientId}>
                          <button
                            type="button"
                            onClick={() => onSelectIngredient(s.ingredientId)}
                            className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-neutral-800/50"
                          >
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 truncate text-sm font-medium text-neutral-100">
                                {s.name} <UrgencyBadge suggestion={s} />
                              </p>
                              <p className="text-xs text-neutral-500 tabular-nums">
                                {s.stockAvailable} {s.baseUnitCode}
                                {s.dailyBurn > 0 ? ` · gasta ${Math.round(s.dailyBurn * 100) / 100}/día · dura ${formatCoverage(s)}` : ' · sin consumo en 30 días'}
                              </p>
                            </div>
                            <span className="inline-flex shrink-0 items-center gap-2">
                              {qty > 0 ? (
                                <span className="text-sm font-semibold tabular-nums text-amber-400">
                                  +{qty} {s.baseUnitCode}
                                </span>
                              ) : (
                                <span className="text-xs text-neutral-600">Sin meta</span>
                              )}
                              <ArrowRight size={13} className="text-neutral-600" aria-hidden />
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card title="Movimientos recientes" description="Todo el inventario" icon={History}>
        <MovementTimeline showIngredientName />
      </Card>
    </div>
  )
}
