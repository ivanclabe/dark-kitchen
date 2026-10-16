import { useComposition } from '@/modules/products/hooks/useComposition'
import { useSetProductActive } from '@/modules/products/hooks/useProducts'
import type { Product } from '@/modules/products/types'
import { useShowDishCosts } from '@/shared/costs/costSettings'
import { dishMargin } from '@/shared/costs/dishMargin'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { KitchenLink as Link } from '@/shared/kitchen/KitchenLink'
import { ActiveBadge } from '@/shared/ui/Badge'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { BarChart3, BookOpen, ChevronRight, Layers, Power, type LucideIcon } from 'lucide-react'

type Tone = 'ok' | 'warn' | 'error' | 'muted'

const CHIP: Record<Tone, string> = {
  ok: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
  warn: 'bg-amber-500/10 text-amber-400 ring-amber-500/25',
  error: 'bg-red-500/10 text-red-400 ring-red-500/25',
  muted: 'bg-neutral-800 text-neutral-400 ring-neutral-700/60',
}
const STATUS: Record<Tone, string> = {
  ok: 'text-neutral-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
  muted: 'text-neutral-500',
}

/** One related module: what it is, how it stands for this dish, and where it leads. */
function ConnectionRow({ to, icon: Icon, title, status, tone, action }: { to: string; icon: LucideIcon; title: string; status: string; tone: Tone; action: string }) {
  return (
    <li>
      <Link
        to={to}
        className="group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-neutral-800/60 focus-visible:bg-neutral-800/60 focus-visible:outline-none"
      >
        <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-lg ring-1', CHIP[tone])} aria-hidden>
          <Icon size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-neutral-100">{title}</span>
          <span className={clsx('block text-xs tabular-nums', STATUS[tone])}>{status}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-neutral-400 group-hover:text-neutral-100">
          {action}
          <ChevronRight size={14} aria-hidden />
        </span>
      </Link>
    </li>
  )
}

/**
 * «Editar plato» → what this dish is connected to, each with its state at a
 * glance (recipe and its cost, options, sales) and its availability as a
 * switch. `usesInventory` and `price` are the values being edited, so the
 * rows follow the form before it is saved.
 */
export function DishConnections({ product, usesInventory, price }: { product: Product; usesInventory: boolean; price: number }) {
  const { can } = useActiveKitchen()
  const { show } = useToast()
  const setActive = useSetProductActive()
  const dishCosts = useShowDishCosts()
  const shared = Boolean(product.masterProductId)
  const composition = useComposition(product.id, !shared)

  // Recipe: whether it exists and, for whoever sees costs, what it costs against the price.
  const recipe: { status: string; tone: Tone; action: string } = shared
    ? { status: 'La define el menú maestro', tone: 'muted', action: 'Ver' }
    : !usesInventory
      ? { status: 'No aplica: este plato no descuenta inventario', tone: 'muted', action: product.activeRecipeVersion ? 'Ver' : 'Crear' }
      : !product.activeRecipeVersion
        ? { status: 'Sin receta: no reserva ni descuenta insumos', tone: 'warn', action: 'Crear' }
        : (() => {
            const margin = dishCosts.show ? dishMargin(price, product.estimatedCost, dishCosts.targetPct) : null
            const cost = margin && margin.status !== 'no_cost' ? ` · costo ${formatMoney(product.estimatedCost)}` : ''
            const pct = margin?.foodCostPct != null ? ` (${margin.foodCostPct.toLocaleString('es-CO')} %)` : ''
            const tone: Tone = margin?.status === 'below_cost' ? 'error' : margin?.status === 'above_target' ? 'warn' : 'ok'
            return { status: `Versión ${product.activeRecipeVersion}${cost}${pct}`, tone, action: 'Editar' }
          })()

  const groups = composition.data?.groups ?? []
  const options = groups.reduce((sum, g) => sum + g.options.length, 0)
  const compositionStatus = composition.isLoading
    ? 'Cargando…'
    : groups.length > 0
      ? `${groups.length} ${groups.length === 1 ? 'grupo' : 'grupos'} · ${options} ${options === 1 ? 'opción' : 'opciones'}`
      : 'Sin opciones: se vende tal cual'

  function toggleActive(next: boolean) {
    setActive.mutate(
      { id: product.id, active: next },
      {
        onSuccess: () => show(next ? `«${product.name}» vuelve a estar disponible.` : `«${product.name}» quedó inactivo: no aparece en el menú.`),
        onError: (err) => show(getErrorMessage(err, 'No se pudo cambiar el estado'), 'error'),
      },
    )
  }

  return (
    <section aria-labelledby="dish-connections" className="space-y-2">
      <h3 id="dish-connections" className={typography.overline}>
        Conectado con
      </h3>
      <ul className="divide-y divide-neutral-800/60 rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-1">
        <ConnectionRow to={`/recipes/${product.id}`} icon={BookOpen} title="Receta" status={recipe.status} tone={recipe.tone} action={recipe.action} />
        {!shared && (
          <ConnectionRow
            to={`/dishes/${product.id}/composition`}
            icon={Layers}
            title="Composición"
            status={compositionStatus}
            tone={groups.length > 0 ? 'ok' : 'muted'}
            action={groups.length > 0 ? 'Editar' : 'Agregar'}
          />
        )}
        {can('reports.view') && (
          <ConnectionRow
            to={`/insights?tab=products&product=${product.id}`}
            icon={BarChart3}
            title="Ventas y rentabilidad"
            status="Unidades, ingresos y margen en Insights"
            tone="muted"
            action="Ver"
          />
        )}
      </ul>

      {/* Availability: a switch, not a button lost among the links. */}
      <div className="flex items-center gap-3 rounded-xl border border-neutral-800/60 bg-neutral-900/40 px-3.5 py-3">
        <span
          className={clsx('flex size-9 shrink-0 items-center justify-center rounded-lg ring-1', product.active ? CHIP.ok : CHIP.muted)}
          aria-hidden
        >
          <Power size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-medium text-neutral-100">
            Disponible <ActiveBadge active={product.active} />
          </span>
          <span className="block text-xs text-neutral-500">
            {shared
              ? 'Lo maneja el menú maestro; la disponibilidad del día se ajusta en el planificador.'
              : product.active
                ? 'Aparece en el menú y se puede pedir.'
                : 'Oculto: no aparece en el menú ni se puede pedir.'}
          </span>
        </span>
        {!shared && <Switch checked={product.active} onChange={toggleActive} label="Plato disponible" disabled={setActive.isPending} />}
      </div>
    </section>
  )
}
