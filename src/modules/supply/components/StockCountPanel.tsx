import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useIngredientUnits } from '@/shared/hooks/useIngredientUnits'
import { compatibleUnits, formatQuantity, unitFactor } from '@/shared/units/conversion'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Chip } from '@/shared/ui/Chip'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { FormField, Select } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { NumberInput } from '@/shared/ui/NumberInput'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate, formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { ArrowLeft, CheckCircle2, ClipboardCheck, History, Search, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { StockCountLine } from '../api/stockCounts'
import { useCategories, useIngredients } from '../hooks/useIngredients'
import { useApplyCount, useCancelCount, useCountLines, useOpenCount, useRecentCounts, useSetCountLine, useStartCount } from '../hooks/useStockCount'
import { useSuppliers } from '../hooks/useSuppliers'
import type { Ingredient } from '../types'

type Scope = 'all' | 'category' | 'supplier'
type Filter = 'pending' | 'counted' | 'all'

/**
 * ADR 0063 (D5): the physical count. It takes a picture of the stock, the
 * person writes what is on the shelf (in any unit of the ingredient) and, on
 * applying, each difference becomes an adjustment «Conteo físico» against the
 * stock at that moment. Nothing moves until the person confirms.
 */
export function StockCountPanel({ onBack }: { onBack: () => void }) {
  const { can } = useActiveKitchen()
  const allowed = can('inventory.adjust')
  const { data: open, isLoading, isError, error, refetch } = useOpenCount(allowed)

  if (!allowed) {
    return <EmptyState icon={ClipboardCheck} title="Sin permiso para contar" description="El conteo físico registra ajustes de inventario: pídelo a quien administra la cuenta." />
  }
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (isLoading) return <LoadingState variant="block" label="Cargando conteo…" />

  return (
    <div className="space-y-4">
      <Button variant="link" size="sm" icon={ArrowLeft} onClick={onBack}>
        Volver al stock
      </Button>
      {open ? <OpenCount countId={open.id} scope={open.scope} createdAt={open.createdAt} /> : <StartCount />}
    </div>
  )
}

function StartCount() {
  const { show } = useToast()
  const { data: categories } = useCategories()
  const { data: suppliers } = useSuppliers()
  const { data: recent } = useRecentCounts()
  const start = useStartCount()
  const [scope, setScope] = useState<Scope>('all')
  const [categoryId, setCategoryId] = useState('')
  const [supplierId, setSupplierId] = useState('')

  async function handleStart() {
    try {
      await start.mutateAsync(scope === 'category' ? { categoryId } : scope === 'supplier' ? { supplierId } : {})
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo empezar el conteo'), 'error')
    }
  }

  const ready = scope === 'all' || (scope === 'category' && categoryId) || (scope === 'supplier' && supplierId)

  return (
    <>
      <Card title="Conteo físico" description="Cuenta lo que hay en la bodega y corrige el inventario con un solo ajuste." icon={ClipboardCheck}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Qué contar">
            <Chip label="Todo el inventario" active={scope === 'all'} onClick={() => setScope('all')} />
            <Chip label="Una categoría" active={scope === 'category'} onClick={() => setScope('category')} />
            <Chip label="Un proveedor" active={scope === 'supplier'} onClick={() => setScope('supplier')} />
          </div>
          {scope === 'category' && (
            <FormField label="Categoría" required>
              {(a11y) => (
                <Select {...a11y} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          )}
          {scope === 'supplier' && (
            <FormField label="Proveedor" required>
              {(a11y) => (
                <Select {...a11y} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {suppliers
                    ?.filter((s) => s.active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </Select>
              )}
            </FormField>
          )}
          <p className={typography.small}>
            Se guarda lo que dice el sistema ahora. Puedes contar por partes y volver después: el conteo queda abierto hasta que lo apliques o lo descartes.
          </p>
          <Button variant="primary" icon={ClipboardCheck} onClick={() => void handleStart()} loading={start.isPending} disabled={!ready}>
            Empezar conteo
          </Button>
        </div>
      </Card>

      {recent && recent.length > 0 && (
        <Card title="Conteos anteriores" icon={History}>
          <ul className="divide-y divide-neutral-800/60">
            {recent.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate text-neutral-200">{c.scope}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-neutral-500">
                  {formatDate((c.appliedAt ?? c.createdAt).slice(0, 10))}
                  {c.status === 'applied' ? (
                    <Badge tone="success" size="sm">
                      Aplicado
                    </Badge>
                  ) : (
                    <Badge tone="neutral" size="sm">
                      Descartado
                    </Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}

function OpenCount({ countId, scope, createdAt }: { countId: string; scope: string; createdAt: string }) {
  const { show } = useToast()
  const { data: lines, isLoading, isError, error, refetch } = useCountLines(countId)
  const { data: ingredients } = useIngredients()
  const { units, infoFor } = useIngredientUnits()
  const setLine = useSetCountLine(countId)
  const apply = useApplyCount()
  const cancel = useCancelCount()
  const [filter, setFilter] = useState<Filter>('pending')
  const [query, setQuery] = useState('')
  const [confirm, setConfirm] = useState<'apply' | 'cancel' | null>(null)

  const byId = useMemo(() => new Map((ingredients ?? []).map((i) => [i.id, i])), [ingredients])
  const rows = useMemo(
    () =>
      (lines ?? [])
        .map((line) => ({ line, ingredient: byId.get(line.ingredientId) }))
        .filter((r): r is { line: StockCountLine; ingredient: Ingredient } => Boolean(r.ingredient))
        .sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name, 'es')),
    [lines, byId],
  )
  const counted = rows.filter((r) => r.line.countedBaseQty !== null)
  const q = query.trim().toLowerCase()
  const visible = rows.filter(
    (r) =>
      (filter === 'all' || (filter === 'counted') === (r.line.countedBaseQty !== null)) &&
      (!q || r.ingredient.name.toLowerCase().includes(q) || r.ingredient.code.toLowerCase().includes(q)),
  )
  // Against the snapshot: the real adjustment uses the stock at the moment of applying.
  const withDifference = counted.filter((r) => Math.abs((r.line.countedBaseQty ?? 0) - r.line.systemQty) > 1e-6)
  const value = withDifference.reduce((sum, r) => sum + ((r.line.countedBaseQty ?? 0) - r.line.systemQty) * r.ingredient.avgCost, 0)

  async function save(line: StockCountLine, quantity: number | null, unitId: string | null) {
    try {
      await setLine.mutateAsync({ lineId: line.id, quantity, unitId })
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar lo contado'), 'error')
    }
  }

  async function handleApply() {
    try {
      const result = await apply.mutateAsync(countId)
      setConfirm(null)
      show(
        result.adjusted > 0
          ? `Conteo aplicado: ${result.adjusted} ajuste(s) por ${formatMoney(result.value)}.`
          : `Conteo aplicado: los ${result.counted} insumos contados coinciden con el sistema.`,
      )
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo aplicar el conteo'), 'error')
    }
  }

  async function handleCancel() {
    try {
      await cancel.mutateAsync(countId)
      setConfirm(null)
      show('Conteo descartado: el inventario no cambió.')
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo descartar el conteo'), 'error')
    }
  }

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (isLoading) return <LoadingState variant="block" label="Cargando insumos del conteo…" />

  return (
    <>
      <Card
        title="Conteo en curso"
        description={`${scope} · empezó el ${formatDate(createdAt.slice(0, 10))}`}
        icon={ClipboardCheck}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" icon={XCircle} onClick={() => setConfirm('cancel')}>
              Descartar
            </Button>
            <Button variant="primary" size="sm" icon={CheckCircle2} onClick={() => setConfirm('apply')} disabled={counted.length === 0}>
              Aplicar ajustes
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800" aria-hidden>
            <div className="h-full rounded-full bg-brasa-500 transition-[width]" style={{ width: `${rows.length ? (counted.length / rows.length) * 100 : 0}%` }} />
          </div>
          <p className={typography.small}>
            {counted.length} de {rows.length} contados
            {withDifference.length > 0 && ` · ${withDifference.length} con diferencia (${value >= 0 ? '+' : ''}${formatMoney(value)})`}
          </p>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o código…"
              aria-label="Buscar insumo del conteo"
              className="w-full min-w-0 rounded-lg border border-neutral-800 bg-neutral-900 py-2.5 pr-3 pl-9 text-sm text-neutral-100 transition-colors outline-none placeholder:text-neutral-500 hover:border-neutral-700 focus:border-focus focus:ring-2 focus:ring-focus/25"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip label="Por contar" count={rows.length - counted.length} active={filter === 'pending'} onClick={() => setFilter('pending')} />
            <Chip label="Contados" count={counted.length} active={filter === 'counted'} onClick={() => setFilter('counted')} />
            <Chip label="Todos" count={rows.length} active={filter === 'all'} onClick={() => setFilter('all')} />
          </div>
        </div>
      </Card>

      <Card title="Insumos" description="Escribe lo que hay; se guarda al salir del campo." icon={ClipboardCheck}>
        {visible.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={filter === 'pending' ? 'Todo contado' : 'Nada para mostrar'}
            description={filter === 'pending' ? 'Revisa los contados y aplica los ajustes.' : 'Prueba con otro filtro o búsqueda.'}
            compact
          />
        ) : (
          <ul className="divide-y divide-neutral-800/60">
            {visible.map(({ line, ingredient }) => (
              <CountRow key={line.id} line={line} ingredient={ingredient} units={units} info={infoFor(ingredient)} onSave={(qty, unitId) => void save(line, qty, unitId)} />
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={confirm === 'apply'}
        onClose={() => setConfirm(null)}
        onConfirm={() => void handleApply()}
        pending={apply.isPending}
        title="Aplicar el conteo"
        confirmLabel="Sí, aplicar ajustes"
        description={
          <>
            Se registra un ajuste <strong>«Conteo físico»</strong> por cada insumo contado que no coincide con el inventario de este momento ({counted.length} contados
            {withDifference.length > 0 ? `, ${withDifference.length} con diferencia` : ', sin diferencias por ahora'}). Los insumos sin contar no cambian. No se puede deshacer.
          </>
        }
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        onClose={() => setConfirm(null)}
        onConfirm={() => void handleCancel()}
        pending={cancel.isPending}
        danger
        title="Descartar el conteo"
        confirmLabel="Sí, descartar"
        description="Se pierde lo contado y el inventario no cambia."
      />
    </>
  )
}

function CountRow({
  line,
  ingredient,
  units,
  info,
  onSave,
}: {
  line: StockCountLine
  ingredient: Ingredient
  units: ReturnType<typeof useIngredientUnits>['units']
  info: ReturnType<ReturnType<typeof useIngredientUnits>['infoFor']>
  onSave: (quantity: number | null, unitId: string | null) => void
}) {
  const choices = compatibleUnits(info, units)
  const [qty, setQty] = useState<number | null>(line.countedQty)
  // Weight and volume are counted in kg and l (the shelf is not weighed in grams); the person can change it.
  const preferredCode = ingredient.baseUnitCode === 'g' ? 'kg' : ingredient.baseUnitCode === 'ml' ? 'l' : ingredient.baseUnitCode
  const defaultUnitId = choices.find((u) => u.code === preferredCode)?.id ?? ingredient.baseUnitId
  const [unitId, setUnitId] = useState(line.countedUnitId ?? defaultUnitId)
  const unitCode = units.find((u) => u.id === unitId)?.code ?? ingredient.baseUnitCode
  const factor = unitFactor(unitCode, info, units) ?? 1
  const base = qty === null ? null : qty * factor
  const diff = base === null ? null : base - line.systemQty
  const changed = qty !== line.countedQty || (qty !== null && unitId !== (line.countedUnitId ?? defaultUnitId))

  return (
    <li className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-neutral-100">{ingredient.name}</p>
        <p className="text-xs text-neutral-500 tabular-nums">
          Sistema: {formatQuantity(line.systemQty, ingredient.baseUnitCode)}
          {diff !== null && Math.abs(diff) > 1e-6 && (
            <span className={clsx('ml-2 font-medium', diff < 0 ? 'text-red-400' : 'text-emerald-400')}>
              {diff > 0 ? '+' : '−'}
              {formatQuantity(Math.abs(diff), ingredient.baseUnitCode)} · {formatMoney(Math.abs(diff) * ingredient.avgCost)}
            </span>
          )}
          {diff !== null && Math.abs(diff) <= 1e-6 && <span className="ml-2 text-emerald-400">Coincide</span>}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-28">
          <NumberInput
            value={qty}
            onValueChange={setQty}
            decimals={3}
            min={0}
            aria-label={`Cantidad contada de ${ingredient.name}`}
            onBlur={() => {
              if (changed) onSave(qty, qty === null ? null : unitId)
            }}
          />
        </div>
        <Select
          value={unitId}
          onChange={(e) => {
            setUnitId(e.target.value)
            if (qty !== null) onSave(qty, e.target.value)
          }}
          aria-label={`Unidad de ${ingredient.name}`}
          className="!mt-0 !w-24"
        >
          {(choices.length ? choices : units.filter((u) => u.id === ingredient.baseUnitId)).map((u) => (
            <option key={u.id} value={u.id}>
              {u.code}
            </option>
          ))}
        </Select>
      </div>
    </li>
  )
}
