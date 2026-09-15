import { useIngredients } from '@/modules/inventory/hooks/useIngredients'
import type { Ingredient } from '@/modules/inventory/types'
import { useProducts } from '@/modules/products/hooks/useProducts'
import type { Product } from '@/modules/products/types'
import { Combobox } from '@/shared/ui/Combobox'
import {
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  tableWrapperClass,
  tdClass,
  thClass,
} from '@/shared/ui/formClasses'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useActiveRecipe, useCreateRecipeVersion } from '../hooks/useRecipes'
import type { ActiveRecipe, RecipeItemDraft } from '../types'
import { getErrorMessage } from '@/shared/utils/errors'

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
  const createVersion = useCreateRecipeVersion(product.id)
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

  async function handleSave() {
    setError(null)
    const validRows = rows.filter((r) => r.ingredientId && r.quantity > 0)
    if (validRows.length === 0) {
      setError('Agrega al menos un ingrediente con cantidad mayor a 0')
      return
    }
    try {
      await createVersion.mutateAsync(validRows.map(({ ingredientId, quantity }) => ({ ingredientId, quantity })))
    } catch (err) {
      setError(getErrorMessage(err, 'Error al guardar la receta'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-50">Receta — {product.name}</h1>
          <p className="text-sm text-neutral-400">
            Precio de venta: ${product.price.toFixed(2)}
            {activeRecipe && <> · Versión actual: v{activeRecipe.version}</>}
          </p>
        </div>
        <Link to="/products" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← Volver a platos
        </Link>
      </div>

      <div className={tableWrapperClass}>
        <table className="min-w-full divide-y divide-neutral-800">
          <thead className="bg-neutral-900">
            <tr>
              <th className={thClass}>Insumo</th>
              <th className={thClass}>Cantidad (unidad base)</th>
              <th className={thClass}>Costo línea</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {rows.map((row) => {
              const ingredient = ingredients.find((i) => i.id === row.ingredientId)
              return (
                <tr key={row.key}>
                  <td className={`${tdClass} min-w-56`}>
                    <Combobox
                      value={row.ingredientId}
                      onChange={(value) => updateRow(row.key, { ingredientId: value })}
                      options={ingredientOptions}
                      placeholder="Nombre o código…"
                      emptyMessage="Sin insumos con ese nombre o código"
                    />
                  </td>
                  <td className={tdClass}>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={row.quantity || ''}
                      onChange={(e) => updateRow(row.key, { quantity: Number(e.target.value) })}
                      className={inputClass}
                    />
                    {ingredient && <span className="ml-2 text-xs text-neutral-500">{ingredient.baseUnitCode}</span>}
                  </td>
                  <td className={tdClass}>${(row.quantity * ingredientAvgCost(row.ingredientId)).toFixed(2)}</td>
                  <td className={`${tdClass} text-right`}>
                    <button onClick={() => removeRow(row.key)} className="text-neutral-400 hover:underline">
                      Quitar
                    </button>
                  </td>
                </tr>
              )
            })}
            <tr>
              <td className={tdClass}>
                <button onClick={addRow} className="text-orange-500 hover:underline">
                  + Agregar ingrediente
                </button>
              </td>
              <td className={tdClass}></td>
              <td className={`${tdClass} font-medium`}>${estimatedCost.toFixed(2)}</td>
              <td className={tdClass}></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className={`${cardClass} flex flex-wrap items-center gap-6`}>
        <div>
          <p className={labelClass}>Costo estimado</p>
          <p className="text-lg font-semibold text-neutral-50">${estimatedCost.toFixed(2)}</p>
        </div>
        <div>
          <p className={labelClass}>Margen</p>
          <p className={`text-lg font-semibold ${margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ${margin.toFixed(2)}
          </p>
        </div>
        <div className="ml-auto">
          {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
          <button onClick={handleSave} disabled={createVersion.isPending} className={primaryButtonClass}>
            Guardar como nueva versión
          </button>
        </div>
      </div>
      <p className="text-xs text-neutral-500">
        Guardar crea una nueva versión de la receta (v{(activeRecipe?.version ?? 0) + 1}) sin borrar el historial de
        versiones anteriores.
      </p>
    </div>
  )
}

export function RecipeEditorPage() {
  const { productId } = useParams<{ productId: string }>()
  const id = productId ?? ''

  const { data: products } = useProducts()
  const { data: ingredients } = useIngredients()
  const { data: activeRecipe, isLoading } = useActiveRecipe(id)

  const product = products?.find((p) => p.id === id)

  if (!product || !ingredients || isLoading) return <p className="text-neutral-400">Cargando…</p>

  return (
    <RecipeForm
      key={activeRecipe?.recipeId ?? 'new'}
      product={product}
      activeRecipe={activeRecipe ?? null}
      ingredients={ingredients}
    />
  )
}
