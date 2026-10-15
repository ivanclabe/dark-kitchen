import { useBackTarget, useHere } from '@/shared/hooks/useBackTarget'
import { NumberInput } from '@/shared/ui/NumberInput'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { KitchenLink as Link } from '@/shared/kitchen/KitchenLink'
import { Page } from '@/shared/ui/Page'
import { useIngredients } from '@/modules/supply/hooks/useIngredients'
import type { Ingredient } from '@/modules/supply/types'
import { useProducts } from '@/modules/products/hooks/useProducts'
import type { Product } from '@/modules/products/types'
import { Badge } from '@/shared/ui/Badge'
import { Button, buttonClass } from '@/shared/ui/Button'
import { Combobox } from '@/shared/ui/Combobox'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { EmptyState } from '@/shared/ui/EmptyState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { PageHeader } from '@/shared/ui/PageHeader'
import { StatCard } from '@/shared/ui/StatCard'
import { useToast } from '@/shared/ui/Toast'
import { tdClass } from '@/shared/ui/formClasses'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatMoney } from '@/shared/utils/format'
import { BarChart3, BookOpen, CookingPot, Plus, Save, Trash2, Warehouse } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useIngredientUnits } from '@/shared/hooks/useIngredientUnits'
import { compatibleUnits, equivalence, formatNumber, formatQuantity, PORTION_UNIT, toBase, unitLabel } from '@/shared/units/conversion'
import { FormField, Select } from '@/shared/ui/FormField'
import { useParams } from 'react-router-dom'
import { useActiveRecipe, useCreateRecipeVersion } from '../hooks/useRecipes'
import type { RecipeItemDraft } from '../types'

interface DraftRow extends Omit<RecipeItemDraft, 'unitId'> {
  key: string
  /** ADR 0056: the unit the quantity is written in (null = the ingredient's base unit). */
  unitCode: string | null
}

/** A line as it was saved: shown as it was written (150 g), even when the base is kg (ADR 0056). */
export interface InitialRow {
  ingredientId: string
  quantity: number
  unitCode: string | null
}

/** ADR 0057: what only a preparation's recipe has — what a batch yields and, optionally, a portion. */
export interface PreparationSettings {
  yieldQuantity: number
  yieldUnitId: string | null
  /** Size of a portion (in portionUnitId or the base); 0 = none. */
  portion: number
  portionUnitId: string | null
}

/** Whose recipe this is: a dish, or a preparation (ADR 0057) — the same editor for both. */
export type RecipeOwner =
  | { kind: 'dish'; product: Product }
  | {
      kind: 'preparation'
      id: string
      name: string
      code: string
      baseUnitCode: string
      yieldQuantity: number | null
      yieldUnitCode: string | null
      yieldUnitQuantity: number | null
      /** Base units in one portion. */
      portion: number | null
    }

export function RecipeForm({
  owner,
  version,
  initialRows,
  ingredients,
  onSave,
  saving,
}: {
  owner: RecipeOwner
  /** The active version (null = no recipe yet). */
  version: number | null
  initialRows: InitialRow[]
  ingredients: Ingredient[]
  onSave: (items: RecipeItemDraft[], preparation?: PreparationSettings) => Promise<void>
  saving: boolean
}) {
  const { can } = useActiveKitchen()
  const product = owner.kind === 'dish' ? owner.product : null
  const prep = owner.kind === 'preparation' ? owner : null
  const back = useBackTarget(prep ? { to: `/supply/preparaciones/${prep.id}`, label: 'Volver a la preparación' } : { to: '/menu-planner', label: 'Volver al planificador' })
  const here = useHere('Receta')
  const { show } = useToast()
  const { units, infoFor } = useIngredientUnits()
  // Consultar la receta (y su costo) no es lo mismo que cambiarla: recipes.edit. Un plato de menú maestro tampoco se edita aquí.
  const readOnly = Boolean(product?.masterProductId) || !can('recipes.edit')
  const [rows, setRows] = useState<DraftRow[]>(() => initialRows.map((row) => ({ key: crypto.randomUUID(), ...row })))
  const [error, setError] = useState<string | null>(null)
  // ADR 0057: a preparation's yield and portion, as written («0,85 kg», «25 g»).
  const [yieldQty, setYieldQty] = useState<number | null>(prep ? (prep.yieldUnitQuantity ?? prep.yieldQuantity) : null)
  const [yieldUnit, setYieldUnit] = useState<string | null>(prep?.yieldUnitCode ?? null)
  const [portionQty, setPortionQty] = useState<number | null>(prep?.portion ?? null)
  const [portionUnit, setPortionUnit] = useState<string | null>(null)

  const ingredientOptions = useMemo(
    () =>
      ingredients
        // A preparation does not carry itself (the database also rejects deeper cycles).
        .filter((i) => i.id !== prep?.id)
        .map((i) => ({ value: i.id, label: i.name, sublabel: `${i.isPreparation ? 'Preparación · ' : ''}${i.code} · ${i.baseUnitCode}` })),
    [ingredients, prep?.id],
  )

  function addRow() {
    setRows((r) => [...r, { key: crypto.randomUUID(), ingredientId: '', quantity: 0, unitCode: null }])
  }

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function removeRow(key: string) {
    setRows((r) => r.filter((row) => row.key !== key))
  }

  function ingredientAvgCost(ingredientId: string) {
    return ingredients.find((i) => i.id === ingredientId)?.avgCost ?? 0
  }

  const ingredientOf = (id: string) => ingredients.find((i) => i.id === id)
  /** The line's quantity in the ingredient's base unit (what it consumes and costs). */
  function baseQuantity(row: DraftRow): number {
    const ingredient = ingredientOf(row.ingredientId)
    if (!row.unitCode || !ingredient || row.unitCode === ingredient.baseUnitCode) return row.quantity
    return toBase(row.quantity, row.unitCode, infoFor(ingredient), units) ?? 0
  }
  const estimatedCost = rows.reduce((sum, row) => sum + baseQuantity(row) * ingredientAvgCost(row.ingredientId), 0)
  const margin = product ? product.price - estimatedCost : 0
  const nextVersion = (version ?? 0) + 1
  const ownerName = product?.name ?? prep?.name ?? ''

  // ADR 0057: what a batch yields and what one portion is, in the preparation's base unit.
  const prepInfo = prep ? infoFor({ id: prep.id, baseUnitCode: prep.baseUnitCode }) : null
  const yieldUnits = compatibleUnits(prepInfo, units)
  const portionUnits = yieldUnits.filter((u) => u.code !== PORTION_UNIT)
  const portionBase = portionQty && prep ? (portionUnit ? (toBase(portionQty, portionUnit, prepInfo, units) ?? 0) : portionQty) : 0
  const yieldBase =
    yieldQty && prep
      ? !yieldUnit || yieldUnit === prep.baseUnitCode
        ? yieldQty
        : yieldUnit === PORTION_UNIT
          ? yieldQty * portionBase
          : (toBase(yieldQty, yieldUnit, prepInfo, units) ?? 0)
      : 0
  const unitCost = yieldBase > 0 ? estimatedCost / yieldBase : 0

  async function handleSave() {
    setError(null)
    const validRows = rows.filter((r) => r.ingredientId && r.quantity > 0)
    if (validRows.length === 0) {
      setError('Agrega al menos un ingrediente con cantidad mayor a 0')
      return
    }
    if (prep && !(yieldBase > 0)) {
      setError('Escribe cuánto rinde un lote')
      return
    }
    const unitIdOf = (code: string | null) => (code ? (units.find((u) => u.code === code)?.id ?? null) : null)
    try {
      await onSave(
        validRows.map(({ ingredientId, quantity, unitCode }) => {
          const base = ingredientOf(ingredientId)?.baseUnitCode
          return { ingredientId, quantity, unitId: unitCode && unitCode !== base ? unitIdOf(unitCode) : null }
        }),
        prep
          ? {
              yieldQuantity: yieldQty ?? 0,
              yieldUnitId: yieldUnit && yieldUnit !== prep.baseUnitCode ? unitIdOf(yieldUnit) : null,
              portion: portionQty ?? 0,
              portionUnitId: portionUnit && portionUnit !== prep.baseUnitCode ? unitIdOf(portionUnit) : null,
            }
          : undefined,
      )
      show(`Receta de "${ownerName}" guardada como v${nextVersion}.`)
    } catch (err) {
      setError(getErrorMessage(err, 'Error al guardar la receta'))
    }
  }

  const columns: DataTableColumn<DraftRow>[] = [
    {
      key: 'ingredient',
      header: 'Insumo',
      cell: (row) => (
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1">
            <Combobox
              aria-label="Insumo"
              value={row.ingredientId}
              onChange={(value) => updateRow(row.key, { ingredientId: value, unitCode: null })}
              options={ingredientOptions}
              placeholder="Nombre o código…"
              emptyMessage="Sin insumos con ese nombre o código"
              disabled={readOnly}
            />
          </span>
          {/* ADR 0031: from the dish to the stock of what it takes. */}
          {row.ingredientId && can('inventory.view') && (
            <Link
              to={`/supply/stock/${row.ingredientId}`}
              state={{ from: here }}
              aria-label={`Ver ${ingredients.find((i) => i.id === row.ingredientId)?.name ?? 'el insumo'} en Stock`}
              title="Ver en Stock"
              className="shrink-0 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100"
            >
              <Warehouse size={14} aria-hidden />
            </Link>
          )}
        </span>
      ),
      className: 'min-w-56',
    },
    {
      key: 'quantity',
      header: 'Cantidad',
      cell: (row) => {
        const ingredient = ingredientOf(row.ingredientId)
        const info = infoFor(ingredient)
        const options = compatibleUnits(info, units)
        const unitCode = row.unitCode ?? ingredient?.baseUnitCode ?? null
        const hint = equivalence(row.quantity, unitCode, info, units)
        return (
          <span className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-2">
              <NumberInput
                value={row.quantity || null}
                onValueChange={(v) => updateRow(row.key, { quantity: v ?? 0 })}
                decimals={3}
                min={0}
                disabled={readOnly}
                aria-label={ingredient ? `Cantidad de ${ingredient.name}` : 'Cantidad'}
                className="!mt-0 w-28"
              />
              {/* ADR 0056: any unit that converts (150 g of an ingredient kept in kg); the base is the default. */}
              <Select
                aria-label={ingredient ? `Unidad de ${ingredient.name}` : 'Unidad'}
                value={unitCode ?? ''}
                onChange={(e) => updateRow(row.key, { unitCode: e.target.value === ingredient?.baseUnitCode ? null : e.target.value })}
                disabled={readOnly || options.length <= 1}
                className="!mt-0 w-24"
              >
                {(options.length ? options : ingredient ? [{ code: ingredient.baseUnitCode }] : []).map((u) => (
                  <option key={u.code} value={u.code}>
                    {unitLabel(u.code, row.quantity)}
                  </option>
                ))}
              </Select>
            </span>
            {hint && <span className="text-xs text-neutral-500 tabular-nums">{hint}</span>}
          </span>
        )
      },
    },
    {
      key: 'lineCost',
      header: 'Costo línea',
      cell: (row) => <span className="tabular-nums">{formatMoney(baseQuantity(row) * ingredientAvgCost(row.ingredientId), { decimals: 'auto' })}</span>,
      align: 'right',
      hideBelow: 'sm',
    },
    {
      key: 'actions',
      header: <span className="sr-only">Acciones</span>,
      cell: (row) =>
        readOnly ? null : (
          <Button variant="link" size="sm" icon={Trash2} className="!text-neutral-400 hover:!text-red-400" onClick={() => removeRow(row.key)}>
            Quitar
          </Button>
        ),
      align: 'right',
    },
  ]

  return (
    <Page>
      <PageHeader help={prep ? 'preparations' : 'recipes-and-cost'}
        title={`Receta — ${ownerName}`}
        description={product ? `Precio de venta: ${formatMoney(product.price)}` : `Preparación por lotes · se guarda en ${prep?.baseUnitCode}`}
        icon={prep ? CookingPot : BookOpen}
        meta={
          <>
            {version ? <Badge tone="success">v{version}</Badge> : <Badge tone="neutral">Sin receta</Badge>}
            {product && !product.usesInventory && <Badge tone="neutral">No usa inventario</Badge>}
            {prep && <Badge tone="info">Preparación</Badge>}
          </>
        }
        backTo={back.to}
        backLabel={back.label}
        actions={
          <>
            {product && can('reports.view') && (
              <Link to={`/insights?tab=products&product=${product.id}`} className={`${buttonClass({ variant: 'secondary' })} inline-flex items-center gap-1.5`}>
                <BarChart3 size={14} aria-hidden /> Ventas y rentabilidad
              </Link>
            )}
            {can('recipes.edit') && (
              <Button
                variant="primary"
                icon={Save}
                onClick={handleSave}
                loading={saving}
                disabled={Boolean(product?.masterProductId)}
                title={product?.masterProductId ? 'La receta de este plato la define su menú maestro' : undefined}
              >
                Guardar como nueva versión
              </Button>
            )}
          </>
        }
      />

      {product && !product.usesInventory && (
        <p role="status" className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 px-4 py-2.5 text-sm text-neutral-300">
          Este plato no descuenta inventario: se vende sin receta y sus pedidos no reservan ni descuentan insumos. Si le pones receta, solo sirve para ver su costo.
        </p>
      )}

      {product?.masterProductId && (
        <p role="status" className="rounded-xl border border-brasa-500/30 bg-brasa-500/5 px-4 py-2.5 text-sm text-neutral-300">
          Este plato viene de un menú maestro: su receta la define el maestro y se actualiza sola. Aquí puedes consultarla y ver su costo.
        </p>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.key}
        emptyState={
          <EmptyState
            icon={BookOpen}
            mood="empty"
            title="Sin ingredientes todavía"
            description={prep ? 'Agrega lo que lleva un lote: insumos u otras preparaciones.' : 'Agrega los insumos que lleva este plato para calcular su costo.'}
            action={
              !readOnly && (
                <Button variant="secondary" size="sm" icon={Plus} onClick={addRow}>
                  Agregar ingrediente
                </Button>
              )
            }
            compact
          />
        }
        footer={
          <tr>
            <td className={tdClass} colSpan={columns.length}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                {readOnly ? (
                  <span />
                ) : (
                  <Button variant="link" size="sm" icon={Plus} onClick={addRow}>
                    Agregar ingrediente
                  </Button>
                )}
                <span className={typography.small}>
                  Total: <span className="font-medium tabular-nums text-neutral-100">{formatMoney(estimatedCost)}</span>
                </span>
              </div>
            </td>
          </tr>
        }
      />

      {prep && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <FormField
            label="Rinde por lote"
            required
            info="Lo que sale de preparar esta receta una vez. Puedes escribirlo en otra unidad compatible (0,85 kg): se guarda en la unidad de la preparación."
            hint={yieldBase > 0 && yieldUnit && yieldUnit !== prep.baseUnitCode ? `= ${formatQuantity(yieldBase, prep.baseUnitCode)}` : undefined}
          >
            {(a11y) => (
              <span className="flex gap-2">
                <NumberInput {...a11y} value={yieldQty} onValueChange={setYieldQty} decimals={3} min={0} disabled={readOnly} className="!mt-0 flex-1" />
                <Select
                  aria-label="Unidad del rendimiento"
                  value={yieldUnit ?? prep.baseUnitCode}
                  onChange={(e) => setYieldUnit(e.target.value === prep.baseUnitCode ? null : e.target.value)}
                  disabled={readOnly}
                  className="!mt-0 w-32"
                >
                  {(yieldUnits.length ? yieldUnits : [{ code: prep.baseUnitCode }]).map((u) => (
                    <option key={u.code} value={u.code}>
                      {unitLabel(u.code, 2)}
                    </option>
                  ))}
                </Select>
              </span>
            )}
          </FormField>
          <FormField
            label="Una porción"
            info="Opcional. Con una porción definida, los platos pueden llevar «1 porción» y ves el costo por porción."
            hint={portionBase > 0 && yieldBase > 0 ? `Un lote da ${formatNumber(yieldBase / portionBase)} porciones` : undefined}
          >
            {(a11y) => (
              <span className="flex gap-2">
                <NumberInput {...a11y} value={portionQty} onValueChange={setPortionQty} decimals={3} min={0} disabled={readOnly} className="!mt-0 flex-1" />
                <Select
                  aria-label="Unidad de la porción"
                  value={portionUnit ?? prep.baseUnitCode}
                  onChange={(e) => setPortionUnit(e.target.value === prep.baseUnitCode ? null : e.target.value)}
                  disabled={readOnly}
                  className="!mt-0 w-32"
                >
                  {(portionUnits.length ? portionUnits : [{ code: prep.baseUnitCode }]).map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.code}
                    </option>
                  ))}
                </Select>
              </span>
            )}
          </FormField>
        </div>
      )}

      {product ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <StatCard label="Costo estimado" value={formatMoney(estimatedCost)} hint={`${rows.length} ingredientes`} />
          <StatCard
            label="Margen"
            value={<span className={margin >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatMoney(margin)}</span>}
            hint={`Precio de venta ${formatMoney(product.price)}`}
            tone={margin >= 0 ? 'good' : 'warn'}
          />
        </div>
      ) : (
        prep && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <StatCard label="Costo del lote" value={formatMoney(estimatedCost)} hint={`${rows.length} ingredientes`} />
            <StatCard label={`Costo por ${prep.baseUnitCode}`} value={formatMoney(unitCost, { decimals: 'auto' })} hint={yieldBase > 0 ? `rinde ${formatQuantity(yieldBase, prep.baseUnitCode)}` : 'escribe el rendimiento'} />
            <StatCard label="Costo por porción" value={portionBase > 0 ? formatMoney(unitCost * portionBase) : '—'} hint={portionBase > 0 ? `1 porción = ${formatQuantity(portionBase, prep.baseUnitCode)}` : 'sin porción definida'} />
          </div>
        )
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <p className={typography.caption}>
        Escribe cada insumo en la unidad que te sea cómoda (por ejemplo 150 g aunque lo compres en kilos): Quanela lo convierte a la unidad del inventario para descontar y costear.
        {prep
          ? ' Los insumos salen del inventario una sola vez, cuando preparas un lote; los platos que llevan esta preparación descuentan solo la preparación.'
          : ' Una preparación (una salsa, una ensalada base) se agrega como cualquier insumo y lleva su costo real.'}
      </p>
      <p className={typography.caption}>Guardar crea una nueva versión de la receta (v{nextVersion}) sin borrar el historial de versiones anteriores.</p>
    </Page>
  )
}

export function RecipeEditorPage() {
  const { productId } = useParams<{ productId: string }>()
  const id = productId ?? ''

  const { data: products } = useProducts()
  const { data: ingredients } = useIngredients()
  const { data: activeRecipe, isLoading } = useActiveRecipe(id)
  const createVersion = useCreateRecipeVersion(id)

  const product = products?.find((p) => p.id === id)

  if (!product || !ingredients || isLoading) {
    return (
      <Page>
        <LoadingState variant="block" label="Cargando receta…" />
      </Page>
    )
  }

  return (
    <RecipeForm
      key={activeRecipe?.recipeId ?? 'new'}
      owner={{ kind: 'dish', product }}
      version={activeRecipe?.version ?? null}
      initialRows={(activeRecipe?.items ?? []).map((item) => ({
        ingredientId: item.ingredientId,
        quantity: item.unitQuantity ?? item.quantity,
        unitCode: item.unitCode,
      }))}
      ingredients={ingredients}
      onSave={async (items) => {
        await createVersion.mutateAsync(items)
      }}
      saving={createVersion.isPending}
    />
  )
}
