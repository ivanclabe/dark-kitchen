import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { KitchenLink as Link } from '@/shared/kitchen/KitchenLink'
import { useHere } from '@/shared/hooks/useBackTarget'
import { ActiveBadge, Badge } from '@/shared/ui/Badge'
import { Button, buttonClass } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { ErrorState } from '@/shared/ui/ErrorState'
import { FormField, Input } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Modal } from '@/shared/ui/Modal'
import { StatCard } from '@/shared/ui/StatCard'
import { useToast } from '@/shared/ui/Toast'
import { cardClass } from '@/shared/ui/formClasses'
import { typography } from '@/shared/ui/typography'
import { formatNumber, formatQuantity, unitLabel } from '@/shared/units/conversion'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDateTime, formatMoney } from '@/shared/utils/format'
import { AlertTriangle, BookOpen, CookingPot, History, Network, Pencil, Undo2, Warehouse } from 'lucide-react'
import { useState } from 'react'
import { usePreparation, useVoidProduction } from '../hooks/usePreparations'
import type { PreparationDetail as Detail, PreparationTreeNode, ProductionBatch } from '../types'
import { UsedIn } from './IngredientDetail'
import { ProductionDrawer } from './ProductionDrawer'

/** «Lleva»: the components all the way down, so a nested preparation shows what it is made of. */
function Tree({ nodes, depth = 0 }: { nodes: PreparationTreeNode[]; depth?: number }) {
  return (
    <ul className={depth ? 'ml-4 border-l border-neutral-800 pl-3' : ''}>
      {nodes.map((n) => (
        <li key={`${depth}-${n.ingredientId}`} className="py-1">
          <span className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2 text-neutral-200">
              {n.isPreparation && <CookingPot size={13} className="text-sky-400" aria-hidden />}
              {n.name}
            </span>
            <span className="tabular-nums text-neutral-500">{formatQuantity(n.quantity, n.unitCode)}</span>
          </span>
          {n.children.length > 0 && <Tree nodes={n.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  )
}

function BatchRow({ batch, baseUnitCode, canVoid, onVoid }: { batch: ProductionBatch; baseUnitCode: string; canVoid: boolean; onVoid: () => void }) {
  const voided = batch.status === 'ANULADO'
  const variance = Number(batch.variancePct)
  return (
    <li className={`py-3 ${voided ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-neutral-100">
            {formatDateTime(batch.createdAt)}
            {batch.createdBy ? <span className="text-neutral-500"> · {batch.createdBy}</span> : null}
          </p>
          <p className={typography.caption}>
            {formatNumber(Number(batch.batches))} {Number(batch.batches) === 1 ? 'lote' : 'lotes'} · receta v{batch.recipeVersion}
            {batch.observation ? ` · ${batch.observation}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {voided ? (
            <Badge tone="neutral">Anulado</Badge>
          ) : (
            <Badge tone={variance < -5 ? 'warning' : variance > 0 ? 'success' : 'neutral'}>
              {variance > 0 ? '+' : ''}
              {formatNumber(variance)} %
            </Badge>
          )}
          {canVoid && !voided && (
            <Button variant="link" size="sm" icon={Undo2} onClick={onVoid}>
              Anular
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1 text-sm text-neutral-300 tabular-nums">
        Rindió {formatQuantity(Number(batch.actualYield), baseUnitCode)} de {formatQuantity(Number(batch.expectedYield), baseUnitCode)} esperados · costo{' '}
        {formatMoney(Number(batch.totalCost))} · {formatMoney(Number(batch.unitCost), { decimals: 'auto' })}/{baseUnitCode}
      </p>
      <p className={`mt-0.5 ${typography.caption}`}>
        Salió: {batch.components.map((c) => `${c.name} ${formatQuantity(Number(c.quantity), c.unitCode)}`).join(' · ')}
      </p>
      {voided && batch.voidReason && <p className={`mt-0.5 ${typography.caption}`}>Anulado: {batch.voidReason}</p>}
    </li>
  )
}

function VoidDialog({ batch, onClose }: { batch: ProductionBatch | null; onClose: () => void }) {
  const voidBatch = useVoidProduction()
  const { show } = useToast()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  async function confirm() {
    if (!batch) return
    setError(null)
    try {
      await voidBatch.mutateAsync({ batchId: batch.id, reason: reason.trim() || null })
      show('Lote anulado: la preparación salió y sus insumos volvieron al inventario.')
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo anular el lote'))
    }
  }
  return (
    <Modal
      open={batch !== null}
      onClose={onClose}
      title="Anular lote"
      description="La preparación sale del inventario y sus insumos vuelven, cada uno a su costo. El lote queda en el historial como anulado."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={voidBatch.isPending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => void confirm()} loading={voidBatch.isPending}>
            Anular lote
          </Button>
        </>
      }
    >
      <FormField label="Motivo">
        {(a11y) => <Input {...a11y} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Opcional: se registró dos veces…" />}
      </FormField>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
    </Modal>
  )
}

function DetailView({ preparation }: { preparation: Detail }) {
  const { can } = useActiveKitchen()
  const here = useHere('Preparación')
  const [producing, setProducing] = useState(false)
  const [voiding, setVoiding] = useState<ProductionBatch | null>(null)
  const p = preparation
  const recipeCost = p.items.reduce((sum, i) => sum + Number(i.lineCost), 0)
  const hasNested = p.tree.some((n) => n.isPreparation)
  const recipeLink = `/supply/preparaciones/${p.id}/receta`

  return (
    <div className="space-y-4">
      <div className={`${cardClass} space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-400">
              <CookingPot size={19} aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={typography.h2}>{p.name}</h2>
                <ActiveBadge active={p.active} />
                {!p.recipe && <Badge tone="warning">Sin receta</Badge>}
                {p.active && p.recipe && p.belowMin && (
                  <Badge tone="warning" icon={AlertTriangle}>
                    Por preparar
                  </Badge>
                )}
              </div>
              <p className={`mt-0.5 ${typography.small}`}>
                {p.code} · preparación por lotes{p.recipe ? ` · receta v${p.recipe.version}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {can('inventory.produce') && p.recipe && p.active && (
              <Button variant="primary" size="sm" icon={CookingPot} onClick={() => setProducing(true)}>
                Preparar lote
              </Button>
            )}
            {can('recipes.edit') && (
              <Link to={recipeLink} state={{ from: here }} className={`${buttonClass({ variant: 'secondary', size: 'sm' })} inline-flex items-center gap-1.5`}>
                <Pencil size={14} aria-hidden /> {p.recipe ? 'Editar receta' : 'Crear receta'}
              </Link>
            )}
            {can('inventory.view') && (
              <Link to={`/supply/stock/${p.id}`} className={`${buttonClass({ variant: 'ghost', size: 'sm' })} inline-flex items-center gap-1.5`}>
                <Warehouse size={14} aria-hidden /> Stock
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-end justify-between gap-3">
          <p className="text-3xl font-semibold tabular-nums text-neutral-50">{formatQuantity(p.stockAvailable, p.baseUnitCode)}</p>
          <p className={typography.caption}>
            disponible{p.minStock > 0 ? ` · mín. ${formatQuantity(p.minStock, p.baseUnitCode)}` : ''}
            {p.lastBatchAt ? ` · último lote ${formatDateTime(p.lastBatchAt)}` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Rinde por lote"
          value={p.recipe ? formatQuantity(p.recipe.yieldQuantity, p.baseUnitCode) : '—'}
          hint={
            p.recipe?.yieldUnitCode && p.recipe.yieldUnitQuantity !== null
              ? `escrito: ${formatNumber(p.recipe.yieldUnitQuantity)} ${unitLabel(p.recipe.yieldUnitCode, p.recipe.yieldUnitQuantity)}`
              : p.portion && p.recipe
                ? `${formatNumber(p.recipe.yieldQuantity / p.portion)} porciones`
                : undefined
          }
        />
        <StatCard label="Costo del lote" value={formatMoney(recipeCost)} hint="a los costos de hoy" />
        <StatCard
          label={`Costo por ${p.baseUnitCode}`}
          value={formatMoney(p.avgCost, { decimals: 'auto' })}
          hint={
            p.stockOnHand > 0
              ? `real de sus lotes${p.theoreticalUnitCost !== null ? ` · receta ${formatMoney(p.theoreticalUnitCost, { decimals: 'auto' })}` : ''}`
              : 'según la receta (sin stock)'
          }
        />
        <StatCard
          label="Costo por porción"
          value={p.portion ? formatMoney(p.portion * p.avgCost) : '—'}
          hint={p.portion ? `1 porción = ${formatQuantity(p.portion, p.baseUnitCode)}` : 'define la porción en la receta'}
        />
      </div>

      <Card
        title={p.recipe ? `Receta v${p.recipe.version}` : 'Receta'}
        description="Lo que lleva un lote. Al prepararlo, sale una sola vez del inventario."
        icon={BookOpen}
      >
        {p.items.length === 0 ? (
          <p className={typography.caption}>
            Todavía no tiene receta.{' '}
            {can('recipes.edit') && (
              <Link to={recipeLink} state={{ from: here }} className="text-brasa-400 hover:underline">
                Crear receta
              </Link>
            )}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-800/60">
            {p.items.map((i) => (
              <li key={i.ingredientId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2">
                  {i.isPreparation ? (
                    <Link to={`/supply/preparaciones/${i.ingredientId}`} className="inline-flex items-center gap-2 text-neutral-100 hover:underline">
                      <CookingPot size={13} className="text-sky-400" aria-hidden /> {i.name}
                    </Link>
                  ) : (
                    <span className="text-neutral-100">{i.name}</span>
                  )}
                </span>
                <span className="text-right tabular-nums">
                  <span className="text-neutral-200">
                    {i.enteredUnitCode && i.enteredQuantity !== null
                      ? `${formatNumber(Number(i.enteredQuantity))} ${unitLabel(i.enteredUnitCode, Number(i.enteredQuantity))} = ${formatQuantity(Number(i.quantity), i.unitCode)}`
                      : formatQuantity(Number(i.quantity), i.unitCode)}
                  </span>
                  <span className="ml-3 text-neutral-500">{formatMoney(Number(i.lineCost))}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {hasNested && (
          <Card title="Lleva" description="Todo lo que hay detrás, incluidas otras preparaciones" icon={Network}>
            <Tree nodes={p.tree} />
          </Card>
        )}
        <UsedIn ingredient={{ id: p.id, baseUnitCode: p.baseUnitCode }} />
      </div>

      <Card title="Lotes" description="Cada preparación con lo que rindió, lo que salió y su costo" icon={History}>
        {p.batches.length === 0 ? (
          <p className={typography.caption}>Todavía no se ha preparado ningún lote.</p>
        ) : (
          <ul className="divide-y divide-neutral-800/60">
            {p.batches.map((b) => (
              <BatchRow key={b.id} batch={b} baseUnitCode={p.baseUnitCode} canVoid={can('inventory.produce')} onVoid={() => setVoiding(b)} />
            ))}
          </ul>
        )}
      </Card>

      {producing && <ProductionDrawer preparation={p} open onClose={() => setProducing(false)} />}
      <VoidDialog key={voiding?.id ?? 'none'} batch={voiding} onClose={() => setVoiding(null)} />
    </div>
  )
}

export function PreparationDetail({ preparationId }: { preparationId: string }) {
  const { data, isLoading, isError, error, refetch } = usePreparation(preparationId)
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (isLoading || !data) return <LoadingState variant="block" label="Cargando preparación…" />
  return <DetailView preparation={data} />
}
