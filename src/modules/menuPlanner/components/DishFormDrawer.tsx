import {
  useCreateProduct,
  useCreateProductCategory,
  useProductCategories,
  useSetProductActive,
  useSetSharedProductPrice,
  useUpdateProduct,
  useUploadProductImage,
} from '@/modules/products/hooks/useProducts'
import type { Product } from '@/modules/products/types'
import { ActiveBadge } from '@/shared/ui/Badge'
import { Button, buttonClass } from '@/shared/ui/Button'
import { Drawer } from '@/shared/ui/Drawer'
import { FormField, Input, Select } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { zodResolver } from '@hookform/resolvers/zod'
import { BookOpen, ImagePlus, Layers, Plus, Power } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { KitchenLink as Link } from '@/shared/kitchen/KitchenLink'
import { z } from 'zod'

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

/**
 * Crear/editar plato desde el planificador — mismo formulario que tenía
 * ProductsPage, en un Drawer. El padre le pasa una `key` distinta cada vez
 * que cambia qué plato se edita (o al abrir para crear uno nuevo), así que
 * este componente siempre monta "fresco" con los valores correctos — sin
 * necesitar un efecto que resetee el formulario a mano.
 */
export function DishFormDrawer({ product, open, onClose }: { product: Product | null; open: boolean; onClose: () => void }) {
  const { data: categories } = useProductCategories()
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const setSharedPrice = useSetSharedProductPrice()
  const createCategory = useCreateProductCategory()
  const setActive = useSetProductActive()
  const uploadImage = useUploadProductImage()
  const { show } = useToast()
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: product
      ? { code: product.code ?? '', name: product.name, description: product.description ?? '', categoryId: product.categoryId ?? '', price: product.price }
      : emptyValues,
  })

  // Plato de un menú maestro: aquí solo se ajusta el precio (lo demás lo define el maestro).
  const shared = Boolean(product?.masterProductId)

  async function onSubmit(values: FormOutput) {
    if (product && shared) {
      if (values.price !== product.price) await setSharedPrice.mutateAsync({ id: product.id, price: values.price })
      show(`Precio de "${product.name}" actualizado.`)
      onClose()
      return
    }
    const input = {
      code: values.code || null,
      name: values.name,
      description: values.description || null,
      categoryId: values.categoryId || null,
      price: values.price,
    }
    if (product) {
      await updateProduct.mutateAsync({ id: product.id, input })
      show(`Plato "${input.name}" actualizado.`)
    } else {
      await createProduct.mutateAsync(input)
      show(`Plato "${input.name}" creado.`)
    }
    onClose()
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return
    await createCategory.mutateAsync(newCategoryName.trim())
    show(`Categoría "${newCategoryName.trim()}" creada.`)
    setNewCategoryName('')
    setShowNewCategory(false)
  }

  const submitting = createProduct.isPending || updateProduct.isPending || setSharedPrice.isPending

  return (
    <Drawer open={open} onClose={onClose} title={product ? 'Editar plato' : 'Nuevo plato'} size="sm">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {shared && product && (
          <div className="space-y-1 rounded-xl border border-brasa-500/30 bg-brasa-500/5 p-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-neutral-100">
              <Layers size={14} className="text-brasa-400" aria-hidden /> Plato del menú maestro
            </p>
            <p className="text-xs text-neutral-400">
              Nombre, categoría y receta los define el menú maestro. Aquí puedes ajustar el precio y, en el calendario, qué días se ofrece.
            </p>
            {product.priceIsLocal && (
              <button
                type="button"
                onClick={() =>
                  setSharedPrice.mutate(
                    { id: product.id, price: null },
                    {
                      onSuccess: () => {
                        show('Se usa de nuevo el precio del maestro.')
                        onClose()
                      },
                    },
                  )
                }
                className="text-xs font-medium text-brasa-400 hover:underline"
              >
                Usar el precio del menú maestro
              </button>
            )}
          </div>
        )}
        <FormField label="Nombre" required error={errors.name?.message}>
          {(a11y) => <Input {...a11y} {...register('name')} disabled={shared} />}
        </FormField>
        <FormField label="Código">{(a11y) => <Input {...a11y} {...register('code')} disabled={shared} />}</FormField>

        <FormField label="Categoría">
          {(a11y) => (
            <Select {...a11y} {...register('categoryId')} disabled={shared}>
              <option value="">Sin categoría</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        {!shared && (
          <>
            {showNewCategory ? (
              <div className="flex items-end gap-2">
                <FormField label="Nueva categoría" className="flex-1">
                  {(a11y) => <Input {...a11y} value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Ej. Hamburguesas" />}
                </FormField>
                <Button variant="secondary" size="sm" onClick={handleAddCategory} loading={createCategory.isPending} disabled={!newCategoryName.trim()}>
                  Crear
                </Button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowNewCategory(true)} className="text-xs text-brasa-400 hover:underline">
                + Crear categoría nueva
              </button>
            )}
          </>
        )}

        <FormField label="Precio de venta" required error={errors.price?.message}>
          {(a11y) => <Input {...a11y} type="number" step="any" min="0" {...register('price')} />}
        </FormField>
        <FormField label="Descripción">{(a11y) => <Input {...a11y} {...register('description')} disabled={shared} />}</FormField>

        {product && (
          <div className="space-y-3 rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Estado</span>
              <ActiveBadge active={product.active} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={`/recipes/${product.id}`} className={`${buttonClass({ variant: 'secondary', size: 'sm' })} inline-flex items-center gap-1.5`}>
                <BookOpen size={13} aria-hidden /> {shared ? 'Ver receta' : product.activeRecipeVersion ? `Receta v${product.activeRecipeVersion}` : 'Crear receta'}
              </Link>
              {!shared && (
                <Button variant="secondary" size="sm" icon={Power} onClick={() => setActive.mutate({ id: product.id, active: !product.active })}>
                  {product.active ? 'Desactivar' : 'Activar'}
                </Button>
              )}
              <label className={`${buttonClass({ variant: 'secondary', size: 'sm' })} inline-flex cursor-pointer items-center gap-1.5`}>
                <ImagePlus size={13} aria-hidden /> Imagen
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label={`Subir imagen de ${product.name}`}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) uploadImage.mutate({ productId: product.id, file })
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          </div>
        )}

        <Button type="submit" variant="primary" icon={product ? undefined : Plus} loading={submitting} className="w-full">
          {product ? 'Guardar cambios' : 'Crear plato'}
        </Button>
      </form>
    </Drawer>
  )
}
