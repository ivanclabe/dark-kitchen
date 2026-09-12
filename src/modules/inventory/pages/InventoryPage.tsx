import { useSuppliers } from '@/modules/suppliers/hooks/useSuppliers'
import { useUnits } from '@/shared/hooks/useUnits'
import {
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  tableWrapperClass,
  tdClass,
  thClass,
} from '@/shared/ui/formClasses'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import {
  useCategories,
  useCreateCategory,
  useCreateIngredient,
  useIngredients,
  useSetIngredientActive,
  useUpdateIngredient,
} from '../hooks/useIngredients'
import type { Ingredient } from '../types'

const schema = z.object({
  code: z.string().min(1, 'Requerido'),
  name: z.string().min(1, 'Requerido'),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  baseUnitId: z.string().min(1, 'Requerido'),
  primarySupplierId: z.string().optional(),
  minStock: z.coerce.number().min(0),
  maxStock: z.coerce.number().optional(),
  perishable: z.boolean(),
  shelfLifeDays: z.coerce.number().optional(),
})

type FormValues = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

const emptyValues: FormValues = {
  code: '',
  name: '',
  description: '',
  categoryId: '',
  baseUnitId: '',
  primarySupplierId: '',
  minStock: 0,
  maxStock: undefined,
  perishable: false,
  shelfLifeDays: undefined,
}

function stockBadge(ingredient: Ingredient) {
  if (ingredient.stockAvailable <= ingredient.minStock) {
    return <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-400">Bajo mínimo</span>
  }
  return null
}

export function InventoryPage() {
  const { data: ingredients, isLoading } = useIngredients()
  const { data: categories } = useCategories()
  const { data: units } = useUnits()
  const { data: suppliers } = useSuppliers()
  const createIngredient = useCreateIngredient()
  const updateIngredient = useUpdateIngredient()
  const createCategory = useCreateCategory()
  const setActive = useSetIngredientActive()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues, unknown, FormOutput>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  function startEdit(ingredient: Ingredient) {
    setEditingId(ingredient.id)
    reset({
      code: ingredient.code,
      name: ingredient.name,
      description: ingredient.description ?? '',
      categoryId: ingredient.categoryId ?? '',
      baseUnitId: ingredient.baseUnitId,
      primarySupplierId: ingredient.primarySupplierId ?? '',
      minStock: ingredient.minStock,
      maxStock: ingredient.maxStock ?? undefined,
      perishable: ingredient.perishable,
      shelfLifeDays: ingredient.shelfLifeDays ?? undefined,
    })
  }

  function cancelEdit() {
    setEditingId(null)
    reset(emptyValues)
  }

  async function onSubmit(values: FormOutput) {
    const input = {
      code: values.code,
      name: values.name,
      description: values.description || null,
      categoryId: values.categoryId || null,
      baseUnitId: values.baseUnitId,
      primarySupplierId: values.primarySupplierId || null,
      minStock: values.minStock,
      maxStock: values.maxStock ?? null,
      perishable: values.perishable,
      shelfLifeDays: values.shelfLifeDays ?? null,
    }

    if (editingId) {
      await updateIngredient.mutateAsync({ id: editingId, input })
    } else {
      await createIngredient.mutateAsync(input)
    }
    cancelEdit()
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return
    await createCategory.mutateAsync(newCategoryName.trim())
    setNewCategoryName('')
  }

  const submitting = createIngredient.isPending || updateIngredient.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-50">Inventario — Insumos</h1>
        <Link to="/inventory/movimientos" className={secondaryButtonClass}>
          Ver movimientos / registrar merma o ajuste
        </Link>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className={`${cardClass} grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4`}>
        <div>
          <label className={labelClass}>Código *</label>
          <input {...register('code')} className={inputClass} />
          {errors.code && <p className="mt-1 text-xs text-red-400">{errors.code.message}</p>}
        </div>
        <div>
          <label className={labelClass}>Nombre *</label>
          <input {...register('name')} className={inputClass} />
          {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
        </div>
        <div>
          <label className={labelClass}>Unidad base *</label>
          <select {...register('baseUnitId')} className={inputClass}>
            <option value="">Selecciona…</option>
            {units?.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.code})
              </option>
            ))}
          </select>
          {errors.baseUnitId && <p className="mt-1 text-xs text-red-400">{errors.baseUnitId.message}</p>}
        </div>
        <div>
          <label className={labelClass}>Categoría</label>
          <div className="flex gap-2">
            <select {...register('categoryId')} className={inputClass}>
              <option value="">Sin categoría</option>
              {categories?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Proveedor principal</label>
          <select {...register('primarySupplierId')} className={inputClass}>
            <option value="">Sin definir</option>
            {suppliers?.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Stock mínimo</label>
          <input type="number" step="any" {...register('minStock')} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Stock máximo</label>
          <input type="number" step="any" {...register('maxStock')} className={inputClass} />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input type="checkbox" id="perishable" {...register('perishable')} className="h-4 w-4" />
          <label htmlFor="perishable" className="text-sm text-neutral-300">
            Perecedero
          </label>
        </div>
        <div>
          <label className={labelClass}>Vida útil (días)</label>
          <input type="number" {...register('shelfLifeDays')} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Descripción</label>
          <input {...register('description')} className={inputClass} />
        </div>

        <div className="flex items-end gap-2 lg:col-span-4">
          <button type="submit" disabled={submitting} className={primaryButtonClass}>
            {editingId ? 'Guardar cambios' : 'Agregar insumo'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className={secondaryButtonClass}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className={`${cardClass} flex flex-wrap items-end gap-2`}>
        <div className="flex-1">
          <label className={labelClass}>Nueva categoría</label>
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            className={inputClass}
            placeholder="Ej. Cárnicos"
          />
        </div>
        <button type="button" onClick={handleAddCategory} className={secondaryButtonClass}>
          Agregar categoría
        </button>
      </div>

      <div className={tableWrapperClass}>
        <table className="min-w-full divide-y divide-neutral-800">
          <thead className="bg-neutral-900">
            <tr>
              <th className={thClass}>Código</th>
              <th className={thClass}>Nombre</th>
              <th className={thClass}>Categoría</th>
              <th className={thClass}>Stock disponible</th>
              <th className={thClass}>Costo prom.</th>
              <th className={thClass}>Proveedor</th>
              <th className={thClass}>Estado</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {isLoading && (
              <tr>
                <td className={tdClass} colSpan={8}>
                  Cargando…
                </td>
              </tr>
            )}
            {ingredients?.map((ingredient) => (
              <tr key={ingredient.id} className={ingredient.active ? '' : 'opacity-50'}>
                <td className={tdClass}>{ingredient.code}</td>
                <td className={tdClass}>{ingredient.name}</td>
                <td className={tdClass}>{ingredient.categoryName ?? '—'}</td>
                <td className={tdClass}>
                  {ingredient.stockAvailable} {ingredient.baseUnitCode} {stockBadge(ingredient)}
                </td>
                <td className={tdClass}>${ingredient.avgCost.toFixed(2)}</td>
                <td className={tdClass}>{ingredient.primarySupplierName ?? '—'}</td>
                <td className={tdClass}>{ingredient.active ? 'Activo' : 'Inactivo'}</td>
                <td className={`${tdClass} space-x-3 text-right`}>
                  <button onClick={() => startEdit(ingredient)} className="text-orange-500 hover:underline">
                    Editar
                  </button>
                  <button
                    onClick={() => setActive.mutate({ id: ingredient.id, active: !ingredient.active })}
                    className="text-neutral-400 hover:underline"
                  >
                    {ingredient.active ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
