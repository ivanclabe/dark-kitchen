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
import { BookOpen, ImagePlus, Pencil, Plus, Power, UtensilsCrossed } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import {
  useCreateProduct,
  useCreateProductCategory,
  useProductCategories,
  useProducts,
  useSetProductActive,
  useUpdateProduct,
  useUploadProductImage,
} from '../hooks/useProducts'
import type { Product } from '../types'

const schema = z.object({
  code: z.string().optional(),
  name: z.string().min(1, 'Requerido'),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  price: z.coerce.number().min(0),
})

type FormValues = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

const emptyValues: FormValues = { code: '', name: '', description: '', categoryId: '', price: 0 }

function marginLabel(product: Product) {
  const margin = product.price - product.estimatedCost
  const color = margin >= 0 ? 'text-emerald-400' : 'text-red-400'
  return <span className={color}>${margin.toFixed(2)}</span>
}

export function ProductsPage() {
  const { data: products, isLoading } = useProducts()
  const { data: categories } = useProductCategories()
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const createCategory = useCreateProductCategory()
  const setActive = useSetProductActive()
  const uploadImage = useUploadProductImage()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues, unknown, FormOutput>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  function startEdit(product: Product) {
    setEditingId(product.id)
    reset({
      code: product.code ?? '',
      name: product.name,
      description: product.description ?? '',
      categoryId: product.categoryId ?? '',
      price: product.price,
    })
  }

  function cancelEdit() {
    setEditingId(null)
    reset(emptyValues)
  }

  async function onSubmit(values: FormOutput) {
    const input = {
      code: values.code || null,
      name: values.name,
      description: values.description || null,
      categoryId: values.categoryId || null,
      price: values.price,
    }

    if (editingId) {
      await updateProduct.mutateAsync({ id: editingId, input })
    } else {
      await createProduct.mutateAsync(input)
    }
    cancelEdit()
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return
    await createCategory.mutateAsync(newCategoryName.trim())
    setNewCategoryName('')
  }

  const submitting = createProduct.isPending || updateProduct.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <UtensilsCrossed size={22} className="text-brasa-500" />
        <h1 className="text-2xl font-semibold text-neutral-50">Platos</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className={`${cardClass} grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4`}>
        <div>
          <label className={labelClass}>Código</label>
          <input {...register('code')} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Nombre *</label>
          <input {...register('name')} className={inputClass} />
          {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
        </div>
        <div>
          <label className={labelClass}>Categoría</label>
          <select {...register('categoryId')} className={inputClass}>
            <option value="">Sin categoría</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Precio de venta *</label>
          <input type="number" step="any" min="0" {...register('price')} className={inputClass} />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className={labelClass}>Descripción</label>
          <input {...register('description')} className={inputClass} />
        </div>

        <div className="flex items-end gap-2">
          <button type="submit" disabled={submitting} className={primaryButtonClass}>
            {editingId ? <Pencil size={15} /> : <Plus size={15} />}
            {editingId ? 'Guardar cambios' : 'Agregar plato'}
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
          <label className={labelClass}>Nueva categoría de plato</label>
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            className={inputClass}
            placeholder="Ej. Hamburguesas"
          />
        </div>
        <button type="button" onClick={handleAddCategory} className={secondaryButtonClass}>
          <Plus size={15} /> Agregar categoría
        </button>
      </div>

      <div className={tableWrapperClass}>
        <table className="min-w-full divide-y divide-neutral-800">
          <thead className="bg-neutral-900">
            <tr>
              <th className={thClass}>Nombre</th>
              <th className={thClass}>Categoría</th>
              <th className={thClass}>Precio</th>
              <th className={thClass}>Costo estimado</th>
              <th className={thClass}>Margen</th>
              <th className={thClass}>Receta</th>
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
            {products?.map((product) => (
              <tr key={product.id} className={product.active ? '' : 'opacity-50'}>
                <td className={tdClass}>{product.name}</td>
                <td className={tdClass}>{product.categoryName ?? '—'}</td>
                <td className={tdClass}>${product.price.toFixed(2)}</td>
                <td className={tdClass}>${product.estimatedCost.toFixed(2)}</td>
                <td className={tdClass}>{marginLabel(product)}</td>
                <td className={tdClass}>
                  {product.activeRecipeVersion ? (
                    `v${product.activeRecipeVersion}`
                  ) : (
                    <span className="text-neutral-500">Sin receta</span>
                  )}
                </td>
                <td className={tdClass}>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${product.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-700 text-neutral-300'}`}>
                    {product.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className={`${tdClass} space-x-3 text-right`}>
                  <Link to={`/recipes/${product.id}`} className="inline-flex items-center gap-1 text-brasa-500 hover:underline">
                    <BookOpen size={13} /> Receta
                  </Link>
                  <button onClick={() => startEdit(product)} className="inline-flex items-center gap-1 text-neutral-300 hover:underline">
                    <Pencil size={13} /> Editar
                  </button>
                  <button
                    onClick={() => setActive.mutate({ id: product.id, active: !product.active })}
                    className="inline-flex items-center gap-1 text-neutral-400 hover:underline"
                  >
                    <Power size={13} /> {product.active ? 'Desactivar' : 'Activar'}
                  </button>
                  <label className="inline-flex cursor-pointer items-center gap-1 text-neutral-400 hover:underline">
                    <ImagePlus size={13} /> Imagen
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) uploadImage.mutate({ productId: product.id, file })
                        e.target.value = ''
                      }}
                    />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
