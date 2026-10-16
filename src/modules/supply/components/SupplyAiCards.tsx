import { InsightExplanation, InsightSummary } from '@/modules/ai/components/InsightParts'
import { insightItemsByRef } from '@/modules/ai/lib/insightItems'
import { useAiFeature, useAiInsight, useInventorySignals } from '@/modules/ai/hooks/useAi'
import { PRIORITY_ORDER } from '@/modules/ai/lib/catalog'
import type { AiInsightFeatureKey, InventorySignal } from '@/modules/ai/types'
import { Badge } from '@/shared/ui/Badge'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { formatDate, formatMoney } from '@/shared/utils/format'
import { ArrowRight, CheckCircle2, Hourglass, PackageX, type LucideIcon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'

const qty = (n: number | null) => (n === null ? '—' : String(Math.round(n * 100) / 100))

function perishableFacts(s: InventorySignal): { badge: ReactNode; facts: string } {
  const days = s.estDaysToExpiry ?? 0
  const expiry = days <= 0 ? 'posiblemente vencido' : `vence en ~${Math.ceil(days)} ${Math.ceil(days) === 1 ? 'día' : 'días'}`
  const waste = s.projectedWasteQty && s.projectedWasteQty > 0 ? ` · al ritmo actual sobrarían ${qty(s.projectedWasteQty)} ${s.baseUnitCode}` : ''
  return {
    badge: (
      <Badge tone={days <= 0 ? 'danger' : 'warning'} size="sm">
        {days <= 0 ? 'Revisar vencimiento' : 'Vence pronto'}
      </Badge>
    ),
    facts: `${qty(s.oldestStockQty)} ${s.baseUnitCode} del ${s.oldestStockAt ? formatDate(s.oldestStockAt) : '—'} · ${expiry} (estimado)${waste}`,
  }
}

function slowFacts(s: InventorySignal): { badge: ReactNode; facts: string } {
  const idle =
    s.daysSinceConsumption === null ? 'sin consumo registrado' : s.daysSinceConsumption === 0 ? 'se usó hoy' : `sin consumo hace ${s.daysSinceConsumption} ${s.daysSinceConsumption === 1 ? 'día' : 'días'}`
  const lasts = s.overstock && s.coverageDays !== null ? ` · alcanza para ~${Math.round(s.coverageDays)} días` : ''
  return {
    badge: (
      <Badge tone={s.slowMover ? 'neutral' : 'info'} size="sm">
        {s.slowMover ? 'Sin movimiento' : 'Stock excesivo'}
      </Badge>
    ),
    facts: `${qty(s.stockOnHand)} ${s.baseUnitCode} · ${formatMoney(s.stockValue)} inmovilizados · ${idle}${lasts}`,
  }
}

function SignalCard({
  feature,
  title,
  description,
  icon,
  rows,
  loading,
  error,
  onRetry,
  describe,
  emptyTitle,
  emptyDescription,
  onSelectIngredient,
  aiEnabled,
}: {
  feature: AiInsightFeatureKey
  title: string
  description: string
  icon: LucideIcon
  rows: InventorySignal[]
  loading: boolean
  error: unknown
  onRetry: () => void
  describe: (s: InventorySignal) => { badge: ReactNode; facts: string }
  emptyTitle: string
  emptyDescription: string
  onSelectIngredient: (ingredientId: string) => void
  /** ADR 0063: the AI only ranks and explains; the list is the rule and is shown without it. */
  aiEnabled: boolean
}) {
  // Solo se pide el análisis si la IA está activa y hay algo que analizar (la función igual lo evita, pero así ni se llama).
  const { data: aiResult, isLoading: aiLoading } = useAiInsight(feature, aiEnabled && !loading && rows.length > 0)
  const aiByRef = useMemo(() => insightItemsByRef(aiResult), [aiResult])
  const sorted = useMemo(() => {
    const rank = (s: InventorySignal) => {
      const item = aiByRef.get(s.ingredientId)
      return item ? PRIORITY_ORDER[item.priority] : 3
    }
    return [...rows].sort((a, b) => rank(a) - rank(b) || b.stockValue - a.stockValue)
  }, [rows, aiByRef])

  return (
    <Card title={title} description={description} icon={icon}>
      {error ? (
        <ErrorState error={error} onRetry={onRetry} compact />
      ) : loading ? (
        <LoadingState variant="block" className="!border-0 !bg-transparent !p-0" />
      ) : rows.length === 0 ? (
        <EmptyState icon={CheckCircle2} title={emptyTitle} description={emptyDescription} compact />
      ) : (
        <>
          {aiEnabled && <InsightSummary feature={feature} result={aiResult} isLoading={aiLoading} />}
          <ul className="divide-y divide-neutral-800/60">
            {sorted.map((s) => {
              const { badge, facts } = describe(s)
              const ai = aiByRef.get(s.ingredientId)
              return (
                <li key={s.ingredientId}>
                  <button
                    type="button"
                    onClick={() => onSelectIngredient(s.ingredientId)}
                    className="-mx-2 flex w-[calc(100%+1rem)] items-start justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-neutral-800/50"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-medium text-neutral-100">
                        <span className="truncate">{s.name}</span> {badge}
                      </span>
                      <span className="block text-xs text-neutral-500 tabular-nums">{facts}</span>
                      {ai && <InsightExplanation item={ai} />}
                    </span>
                    <ArrowRight size={13} className="mt-1 shrink-0 text-neutral-600" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Card>
  )
}

/**
 * Tarjetas de Perecederos y Poco movimiento en el resumen de Stock. Las
 * listas y cifras salen de dk_inventory_signals (reglas fijas con los
 * umbrales configurados) y se ven en todos los planes (ADR 0063); la IA, si
 * está activa, solo prioriza y explica cada caso. Sin IA, una tarjeta vacía
 * no se muestra. Tocar un insumo abre su ficha, donde están Merma, Ajuste y
 * Editar: la IA nunca registra nada por su cuenta.
 */
export function SupplyAiCards({ onSelectIngredient }: { onSelectIngredient: (ingredientId: string) => void }) {
  const perishables = useAiFeature('supply_perishables')
  const slow = useAiFeature('supply_slow_movers')
  const { data: signals, isLoading, error, refetch } = useInventorySignals(true)

  const atRisk = useMemo(() => (signals ?? []).filter((s) => s.perishableRisk), [signals])
  const slowRows = useMemo(() => (signals ?? []).filter((s) => s.slowMover || s.overstock), [signals])
  const showPerishables = perishables.enabled || (!isLoading && atRisk.length > 0)
  const showSlow = slow.enabled || (!isLoading && slowRows.length > 0)

  return (
    <>
      {showPerishables && (
        <SignalCard
          feature="supply_perishables"
          title="Perecederos en riesgo"
          description="Lote más antiguo estimado con las compras: vence pronto o no alcanza a consumirse"
          icon={Hourglass}
          rows={atRisk}
          loading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          describe={perishableFacts}
          emptyTitle="Sin perecederos en riesgo"
          emptyDescription="Ningún insumo perecedero vence pronto al ritmo de consumo actual. Marca como perecederos los insumos que apliquen y su vida útil."
          onSelectIngredient={onSelectIngredient}
          aiEnabled={perishables.enabled}
        />
      )}
      {showSlow && (
        <SignalCard
          feature="supply_slow_movers"
          title="Poco movimiento"
          description="Insumos sin consumo reciente o con más stock del que se usa"
          icon={PackageX}
          rows={slowRows}
          loading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          describe={slowFacts}
          emptyTitle="Todo el stock se mueve"
          emptyDescription="Ningún insumo lleva demasiado tiempo quieto ni tiene stock excesivo."
          onSelectIngredient={onSelectIngredient}
          aiEnabled={slow.enabled}
        />
      )}
    </>
  )
}
