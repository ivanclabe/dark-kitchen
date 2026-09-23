import { useUnits } from '@/shared/hooks/useUnits'
import { Button } from '@/shared/ui/Button'
import { Drawer } from '@/shared/ui/Drawer'
import { FormField, Input, Select } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useCategories, useCreateCategory, useCreateIngredient, useUpdateIngredient } from '../hooks/useIngredients'
import { useSuppliers } from '../hooks/useSuppliers'
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

/**
 * Alta y edición de insumo — mismos campos y validación que el formulario en
 * línea de la antigua InventoryPage, ahora en un Drawer. El padre le pasa una
 * `key` distinta por insumo, así monta limpio sin efecto de reseteo.
 */
export function IngredientFormDrawer({ ingredient, open, onClose }: { ingredient: Ingredient | null; open: boolean; onClose: () => void }) {
  const { data: units } = useUnits()
  const { data: categories } = useCategories()
  const { data: suppliers } = useSuppliers()
  const createIngredient = useCreateIngredient()
  const updateIngredient = useUpdateIngredient()
  const createCategory = useCreateCategory()
  const { show } = useToast()
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: ingredient
      ? {
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
        }
      : emptyValues,
  })

  const perishable = useWatch({ control, name: 'perishable' })

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
    try {
      if (ingredient) {
        await updateIngredient.mutateAsync({ id: ingredient.id, input })
        show(`Insumo "${input.name}" actualizado.`)
      } else {
        await createIngredient.mutateAsync(input)
        show(`Insumo "${input.name}" creado.`)
      }
      onClose()
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar el insumo'), 'error')
    }
  }

  async function handleAddCategory() {
    const name = newCategoryName.trim()
    if (!name) return
    try {
      const created = await createCategory.mutateAsync(name)
      show(`Categoría "${name}" creada.`)
      if (created?.id) setValue('categoryId', created.id)
      setNewCategoryName('')
      setShowNewCategory(false)
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo crear la categoría'), 'error')
    }
  }

  const submitting = createIngredient.isPending || updateIngredient.isPending

  return (
    <Drawer open={open} onClose={onClose} title={ingredient ? 'Editar insumo' : 'Nuevo insumo'} subtitle={ingredient?.name} size="sm">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Código" required error={errors.code?.message}>
            {(a11y) => <Input {...a11y} {...register('code')} />}
          </FormField>
          <FormField label="Unidad base" required error={errors.baseUnitId?.message}>
            {(a11y) => (
              <Select {...a11y} {...register('baseUnitId')}>
                <option value="">Selecciona…</option>
                {units?.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} ({unit.code})
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </div>

        <FormField label="Nombre" required error={errors.name?.message}>
          {(a11y) => <Input {...a11y} {...register('name')} />}
        </FormField>

        <FormField label="Categoría">
          {(a11y) => (
            <Select {...a11y} {...register('categoryId')}>
              <option value="">Sin categoría</option>
              {categories?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        {showNewCategory ? (
          <div className="flex items-end gap-2">
            <FormField label="Nueva categoría" className="flex-1">
              {(a11y) => (
                <Input
                  {...a11y}
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Ej. Cárnicos"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleAddCategory()
                    }
                  }}
                />
              )}
            </FormField>
            <Button variant="secondary" size="sm" onClick={() => void handleAddCategory()} loading={createCategory.isPending} disabled={!newCategoryName.trim()}>
              Crear
            </Button>
          </div>
        ) : (
          <button type="button" onClick={() => setShowNewCategory(true)} className="text-xs text-brasa-400 hover:underline">
            + Crear categoría nueva
          </button>
        )}

        <FormField label="Proveedor principal">
          {(a11y) => (
            <Select {...a11y} {...register('primarySupplierId')}>
              <option value="">Sin definir</option>
              {suppliers?.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Stock mínimo" hint="Dispara la alerta" error={errors.minStock?.message}>
            {(a11y) => <Input {...a11y} type="number" step="any" {...register('minStock')} />}
          </FormField>
          <FormField label="Stock máximo" hint="Meta de reposición" error={errors.maxStock?.message}>
            {(a11y) => <Input {...a11y} type="number" step="any" {...register('maxStock')} />}
          </FormField>
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" {...register('perishable')} className="size-4 accent-brasa-500" />
          Perecedero
        </label>
        {perishable && (
          <FormField label="Vida útil (días)" error={errors.shelfLifeDays?.message}>
            {(a11y) => <Input {...a11y} type="number" {...register('shelfLifeDays')} autoFocus />}
          </FormField>
        )}

        <FormField label="Descripción">{(a11y) => <Input {...a11y} {...register('description')} />}</FormField>

        <Button type="submit" variant="primary" icon={ingredient ? Pencil : Plus} loading={submitting} className="w-full">
          {ingredient ? 'Guardar cambios' : 'Crear insumo'}
        </Button>
      </form>
    </Drawer>
  )
}
