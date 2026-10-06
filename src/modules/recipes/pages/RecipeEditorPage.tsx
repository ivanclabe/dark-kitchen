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
import { BarChart3, BookOpen, Plus, Save, Trash2, Warehouse } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useActiveRecipe, useCreateRecipeVersion } from '../hooks/useRecipes'
import type { ActiveRecipe, RecipeItemDraft } from '../types'

interface DraftRow extends RecipeItemDraft {
  key: string
}

function RecipeForm({
  product,
  activeRecipe,
  ingredients,
}: {
  product: Product
  activeRecipe: ActiveRecipe | null
  ingredients: Ingredient[]
}) {
  const { can } = useActiveKitchen()
  const createVersion = useCreateRecipeVersion(product.id)
  const back = useBackTarget({ to: '/menu-planner', label: 'Volver al planificador' })
  const here = useHere('Receta')
  const { show } = useToast()
  // Consultar la receta (y su costo) no es lo mismo que cambiarla: recipes.edit. Un plato de menú maestro tampoco se edita aquí.
  const readOnly = Boolean(product.masterProductId) || !can('recipes.edit')
  const [rows, setRows] = useState<DraftRow[]>(() =>
    (activeRecipe?.items ?? []).map((item) => ({
      key: crypto.randomUUID(),
      ingredientId: item.ingredientId,
      quantity: item.quantity,
    })),
  )
  const [error, setError] = useState<string | null>(null)

  const ingredientOptions = useMemo(
    () => ingredients.map((i) => ({ value: i.id, label: i.name, sublabel: `${i.code} · ${i.baseUnitCode}` })),
    [ingredients],
  )

  function addRow() {
    setRows((r) => [...r, { key: crypto.randomUUID(), ingredientId: '', quantity: 0 }])
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

  const estimatedCost = rows.reduce((sum, row) => sum + row.quantity * ingredientAvgCost(row.ingredientId), 0)
  const margin = product.price - estimatedCost
  const nextVersion = (activeRecipe?.version ?? 0) + 1

  async function handleSave() {
    setError(null)
    const validRows = rows.filter((r) => r.ingredientId && r.quantity > 0)
    if (validRows.length === 0) {
      setError('Agrega al menos un ingrediente con cantidad mayor a 0')
      return
    }
    try {
      await createVersion.mutateAsync(validRows.map(({ ingredientId, quantity }) => ({ ingredientId, quantity })))
      show(`Receta de "${product.name}" guardada como v${nextVersion}.`)
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
              onChange={(value) => updateRow(row.key, { ingredientId: value })}
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
        const ingredient = ingredients.find((i) => i.id === row.ingredientId)
        return (
          <span className="inline-flex items-center gap-2">
            <NumberInput
              value={row.quantity || null}
              onValueChange={(v) => updateRow(row.key, { quantity: v ?? 0 })}
              decimals={3}
              min={0}
              unit={ingredient?.baseUnitCode}
              disabled={readOnly}
              aria-label={ingredient ? `Cantidad de ${ingredient.name}` : 'Cantidad'}
              className="!mt-0 w-36"
            />
          </span>
        )
      },
    },
    {
      key: 'lineCost',
      header: 'Costo línea',
      cell: (row) => <span className="tabular-nums">{formatMoney(row.quantity * ingredientAvgCost(row.ingredientId), { decimals: 'auto' })}</span>,
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
      <PageHeader help="recipes-and-cost"
        title={`Receta — ${product.name}`}
        description={`Precio de venta: ${formatMoney(product.price)}`}
        icon={BookOpen}
        meta={activeRecipe ? <Badge tone="success">v{activeRecipe.version}</Badge> : <Badge tone="neutral">Sin receta</Badge>}
        backTo={back.to}
        backLabel={back.label}
        actions={
          <>
            {can('reports.view') && (
              <Link to={`/insights?tab=products&product=${product.id}`} className={`${buttonClass({ variant: 'secondary' })} inline-flex items-center gap-1.5`}>
                <BarChart3 size={14} aria-hidden /> Ventas y rentabilidad
              </Link>
            )}
            {can('recipes.edit') && (
              <Button
                variant="primary"
                icon={Save}
                onClick={handleSave}
                loading={createVersion.isPending}
                disabled={Boolean(product.masterProductId)}
                title={product.masterProductId ? 'La receta de este plato la define su menú maestro' : undefined}
              >
                Guardar como nueva versión
              </Button>
            )}
          </>
        }
      />

      {product.masterProductId && (
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
            title="Sin ingredientes todavía"
            description="Agrega los insumos que lleva este plato para calcular su costo."
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        <StatCard label="Costo estimado" value={formatMoney(estimatedCost)} hint={`${rows.length} ingredientes`} />
        <StatCard
          label="Margen"
          value={<span className={margin >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatMoney(margin)}</span>}
          hint={`Precio de venta ${formatMoney(product.price)}`}
          tone={margin >= 0 ? 'good' : 'warn'}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
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
      product={product}
      activeRecipe={activeRecipe ?? null}
      ingredients={ingredients}
    />
  )
}
