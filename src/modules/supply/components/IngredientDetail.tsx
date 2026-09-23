import { ActiveBadge, Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { StatCard } from '@/shared/ui/StatCard'
import { useToast } from '@/shared/ui/Toast'
import { cardClass } from '@/shared/ui/formClasses'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatMoney } from '@/shared/utils/format'
import { AlertTriangle, History, Package, Pencil, Power, SlidersHorizontal, Trash2, Truck } from 'lucide-react'
import { useSetIngredientActive } from '../hooks/useIngredients'
import { isLowStock, suggestedRestock } from '../lib/stock'
import type { Ingredient } from '../types'
import { StockBar } from './IngredientPanel'
import { MovementTimeline } from './MovementTimeline'
import type { MovementMode } from './MovementFormDrawer'

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className={typography.small}>{label}</span>
      <span className="text-sm font-medium text-neutral-100">{value}</span>
    </div>
  )
}

export function IngredientDetail({
  ingredient,
  onEdit,
  onRegisterMovement,
}: {
  ingredient: Ingredient
  onEdit: () => void
  onRegisterMovement: (mode: MovementMode) => void
}) {
  const setActive = useSetIngredientActive()
  const { show } = useToast()
  const low = isLowStock(ingredient)
  const restock = suggestedRestock(ingredient)

  async function handleToggleActive() {
    try {
      await setActive.mutateAsync({ id: ingredient.id, active: !ingredient.active })
      show(ingredient.active ? `"${ingredient.name}" desactivado.` : `"${ingredient.name}" activado.`)
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo cambiar el estado'), 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className={`${cardClass} space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-brasa-500/20 bg-brasa-500/10 text-brasa-400">
              <Package size={19} aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={typography.h2}>{ingredient.name}</h2>
                <ActiveBadge active={ingredient.active} />
                {low && ingredient.active && (
                  <Badge tone="danger" icon={AlertTriangle}>
                    Bajo mínimo
                  </Badge>
                )}
              </div>
              <p className={`mt-0.5 ${typography.small}`}>
                {ingredient.code}
                {ingredient.categoryName ? ` · ${ingredient.categoryName}` : ''}
                {ingredient.description ? ` · ${ingredient.description}` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" icon={Trash2} onClick={() => onRegisterMovement('merma')}>
              Merma
            </Button>
            <Button variant="secondary" size="sm" icon={SlidersHorizontal} onClick={() => onRegisterMovement('ajuste')}>
              Ajuste
            </Button>
            <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>
              Editar
            </Button>
            <Button variant="ghost" size="sm" icon={Power} onClick={() => void handleToggleActive()} loading={setActive.isPending}>
              {ingredient.active ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
        </div>

        <div>
          <div className="flex items-end justify-between gap-3">
            <p className="text-3xl font-semibold tabular-nums text-neutral-50">
              {ingredient.stockAvailable}
              <span className="ml-1.5 text-base font-medium text-neutral-500">{ingredient.baseUnitCode}</span>
            </p>
            <p className={typography.caption}>
              mín. {ingredient.minStock}
              {ingredient.maxStock !== null ? ` · máx. ${ingredient.maxStock}` : ''}
            </p>
          </div>
          <div className="mt-2">
            <StockBar ingredient={ingredient} />
          </div>
          {low && ingredient.active && restock > 0 && (
            <p className="mt-2 text-xs text-amber-400">
              Sugerido reponer {restock} {ingredient.baseUnitCode} para llegar a la meta.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard label="Costo promedio" value={formatMoney(ingredient.avgCost)} hint={`por ${ingredient.baseUnitCode}`} />
        <StatCard label="Valor en stock" value={formatMoney(ingredient.stockOnHand * ingredient.avgCost)} hint={`${ingredient.stockOnHand} en bodega`} />
      </div>

      <Card title="Ficha" icon={Truck}>
        <dl className="divide-y divide-neutral-800/60">
          <Field label="Proveedor principal" value={ingredient.primarySupplierName ?? <span className="text-neutral-600">Sin definir</span>} />
          <Field label="Unidad base" value={ingredient.baseUnitCode} />
          <Field label="Reservado" value={`${Math.round((ingredient.stockOnHand - ingredient.stockAvailable) * 100) / 100} ${ingredient.baseUnitCode}`} />
          <Field
            label="Perecedero"
            value={ingredient.perishable ? `Sí${ingredient.shelfLifeDays ? ` · ${ingredient.shelfLifeDays} días` : ''}` : 'No'}
          />
        </dl>
      </Card>

      <Card title="Movimientos" description="Entradas, salidas y ajustes de este insumo" icon={History}>
        <MovementTimeline ingredientId={ingredient.id} />
      </Card>
    </div>
  )
}
