import { useSuppliers } from '@/modules/suppliers/hooks/useSuppliers'
import { useUnits } from '@/shared/hooks/useUnits'
import { Chip } from '@/shared/ui/Chip'
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
import { AlertTriangle, Boxes, ListChecks, Package, Pencil, Plus, Power } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
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

function isLowStock(ingredient: Ingredient) {
  return ingredient.stockAvailable <= ingredient.minStock
}

function stockBadge(ingredient: Ingredient) {
  if (isLowStock(ingredient)) {
    return (
      <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-400">
        <AlertTriangle size={11} /> Bajo mínimo
      </span>
    )
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
  const [categoryFilter, setCategoryFilter] = useState<'TODAS' | 'BAJO_MINIMO' | string>('TODAS')

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const ing of ingredients ?? []) {
      const key = ing.categoryId ?? 'SIN_CATEGORIA'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [ingredients])

  const lowStockCount = ingredients?.filter(isLowStock).length ?? 0

  const filteredIngredients = ingredients?.filter((ing) => {
    if (categoryFilter === 'TODAS') return true
    if (categoryFilter === 'BAJO_MINIMO') return isLowStock(ing)
    if (categoryFilter === 'SIN_CATEGORIA') return !ing.categoryId
    return ing.categoryId === categoryFilter
  })

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<FormValues, unknown, FormOutput>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const perishable = useWatch({ control, name: 'perishable' })

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
        <div className="flex items-center gap-2">
          <Boxes size={22} className="text-brasa-500" />
          <h1 className="text-2xl font-semibold text-neutral-50">Inventario — Insumos</h1>
        </div>
        <Link to="/inventory/movimientos" className={secondaryButtonClass}>
          <ListChecks size={15} /> Movimientos / merma / ajuste
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
        {perishable && (
          <div>
            <label className={labelClass}>Vida útil (días)</label>
            <input type="number" {...register('shelfLifeDays')} className={inputClass} autoFocus />
          </div>
        )}
        <div className="sm:col-span-2">
          <label className={labelClass}>Descripción</label>
          <input {...register('description')} className={inputClass} />
        </div>

        <div className="flex items-end gap-2 lg:col-span-4">
          <button type="submit" disabled={submitting} className={primaryButtonClass}>
            {editingId ? <Pencil size={15} /> : <Plus size={15} />}
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
          <Plus size={15} /> Agregar categoría
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip label="Todas" count={ingredients?.length ?? 0} active={categoryFilter === 'TODAS'} onClick={() => setCategoryFilter('TODAS')} />
        {lowStockCount > 0 && (
          <Chip
            label="Bajo mínimo"
            count={lowStockCount}
            active={categoryFilter === 'BAJO_MINIMO'}
            onClick={() => setCategoryFilter('BAJO_MINIMO')}
          />
        )}
        {categories?.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            count={categoryCounts.get(c.id) ?? 0}
            active={categoryFilter === c.id}
            onClick={() => setCategoryFilter(c.id)}
          />
        ))}
        {(categoryCounts.get('SIN_CATEGORIA') ?? 0) > 0 && (
          <Chip
            label="Sin categoría"
            count={categoryCounts.get('SIN_CATEGORIA') ?? 0}
            active={categoryFilter === 'SIN_CATEGORIA'}
            onClick={() => setCategoryFilter('SIN_CATEGORIA')}
          />
        )}
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
            {!isLoading && filteredIngredients?.length === 0 && (
              <tr>
                <td className={tdClass} colSpan={8}>
                  Sin insumos en este filtro.
                </td>
              </tr>
            )}
            {filteredIngredients?.map((ingredient) => (
              <tr key={ingredient.id} className={ingredient.active ? '' : 'opacity-50'}>
                <td className={tdClass}>{ingredient.code}</td>
                <td className={tdClass}>
                  <span className="inline-flex items-center gap-1.5">
                    <Package size={13} className="text-neutral-600" /> {ingredient.name}
                  </span>
                </td>
                <td className={tdClass}>{ingredient.categoryName ?? '—'}</td>
                <td className={tdClass}>
                  {ingredient.stockAvailable} {ingredient.baseUnitCode} {stockBadge(ingredient)}
                </td>
                <td className={tdClass}>${ingredient.avgCost.toFixed(2)}</td>
                <td className={tdClass}>{ingredient.primarySupplierName ?? '—'}</td>
                <td className={tdClass}>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ingredient.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-700 text-neutral-300'}`}>
                    {ingredient.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className={`${tdClass} space-x-3 text-right`}>
                  <button
                    onClick={() => startEdit(ingredient)}
                    className="inline-flex items-center gap-1 text-brasa-500 hover:underline"
                  >
                    <Pencil size={13} /> Editar
                  </button>
                  <button
                    onClick={() => setActive.mutate({ id: ingredient.id, active: !ingredient.active })}
                    className="inline-flex items-center gap-1 text-neutral-400 hover:underline"
                  >
                    <Power size={13} /> {ingredient.active ? 'Desactivar' : 'Activar'}
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
