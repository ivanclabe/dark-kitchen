import { Button, IconButton } from '@/shared/ui/Button'
import { Drawer } from '@/shared/ui/Drawer'
import { FormActions, FormField, FormGrid, Input, Select } from '@/shared/ui/FormField'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { MasterProduct, MasterProductInput, MasterRecipeItem, Unit } from '../masterMenusApi'

const CODE = /^[A-Za-z0-9_-]{1,30}$/

/**
 * Plato de un menú maestro con su receta. Los insumos se identifican por
 * CÓDIGO: en cada Cocina se vinculan con su insumo de ese código (o se crea
 * si no existe), así cada una descuenta su propio inventario.
 */
export function MasterProductDrawer({
  product,
  units,
  onSave,
  onClose,
}: {
  product: MasterProduct | null
  units: Unit[]
  onSave: (input: MasterProductInput) => Promise<void>
  onClose: () => void
}) {
  const { show } = useToast()
  const [code, setCode] = useState(product?.code ?? '')
  const [name, setName] = useState(product?.name ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [categoryName, setCategoryName] = useState(product?.categoryName ?? '')
  const [price, setPrice] = useState(product ? String(product.price) : '')
  const [active, setActive] = useState(product?.active ?? true)
  const [recipe, setRecipe] = useState<MasterRecipeItem[]>(product?.recipe ?? [])
  const [saving, setSaving] = useState(false)

  const recipeError = recipe.some((r) => !CODE.test(r.ingredientCode) || !r.ingredientName.trim() || !(r.quantity > 0))
    ? 'Cada insumo necesita código (letras, números, - o _), nombre y cantidad mayor a 0'
    : new Set(recipe.map((r) => r.ingredientCode.toUpperCase())).size !== recipe.length
      ? 'Hay un insumo repetido'
      : null
  const error = !CODE.test(code) ? 'Código: letras, números, - o _' : name.trim().length < 2 ? 'Nombre: mínimo 2 caracteres' : !(Number(price) >= 0) || price === '' ? 'Precio inválido' : recipeError

  function setItem(index: number, patch: Partial<MasterRecipeItem>) {
    setRecipe((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (error) return
    setSaving(true)
    try {
      await onSave({ id: product?.id ?? null, code, name, description, categoryName, price: Number(price), active, recipe })
      show(product ? 'Plato actualizado en todas las cuentas del menú.' : 'Plato agregado a todas las cuentas del menú.')
      onClose()
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar el plato'), 'error')
      setSaving(false)
    }
  }

  return (
    <Drawer open onClose={onClose} title={product ? `Editar ${product.name}` : 'Nuevo plato del menú'} subtitle="Los cambios se aplican solos en todas las cuentas que tienen este menú">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <FormGrid>
          <FormField label="Nombre" required>
            {(a11y) => <Input {...a11y} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
          </FormField>
          <FormField label="Código" required hint="Identifica el plato en cada cuenta">
            {(a11y) => <Input {...a11y} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={30} placeholder="BURG-01" />}
          </FormField>
          <FormField label="Categoría">
            {(a11y) => <Input {...a11y} value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Hamburguesas" />}
          </FormField>
          <FormField label="Precio de venta" required hint="Cada cuenta puede fijar su propio precio">
            {(a11y) => <Input {...a11y} type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} />}
          </FormField>
          <FormField label="Descripción" className="sm:col-span-2">
            {(a11y) => <Input {...a11y} value={description} onChange={(e) => setDescription(e.target.value)} />}
          </FormField>
        </FormGrid>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800/60 px-3 py-2.5 text-sm text-neutral-300">
          Activo en las cocinas
          <Switch checked={active} onChange={setActive} label="Plato activo" />
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className={typography.h3}>Receta</p>
            <Button
              variant="ghost"
              size="sm"
              icon={Plus}
              onClick={() => setRecipe((prev) => [...prev, { ingredientCode: '', ingredientName: '', unitCode: units.find((u) => u.code === 'g')?.code ?? units[0]?.code ?? 'g', quantity: 0 }])}
            >
              Agregar insumo
            </Button>
          </div>
          {recipe.length === 0 ? (
            <p className={typography.caption}>Sin receta: el plato no se podrá confirmar en pedidos hasta que tenga una.</p>
          ) : (
            <ul className="space-y-2">
              {recipe.map((r, i) => (
                <li key={i} className="grid grid-cols-[1fr_1.4fr_0.9fr_0.9fr_auto] items-center gap-2">
                  <Input aria-label="Código del insumo" placeholder="CARNE-01" value={r.ingredientCode} onChange={(e) => setItem(i, { ingredientCode: e.target.value.toUpperCase() })} className="!mt-0" />
                  <Input aria-label="Nombre del insumo" placeholder="Carne de res" value={r.ingredientName} onChange={(e) => setItem(i, { ingredientName: e.target.value })} className="!mt-0" />
                  <Input aria-label="Cantidad" type="number" min="0" step="any" value={r.quantity || ''} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} className="!mt-0" />
                  <Select aria-label="Unidad" value={r.unitCode} onChange={(e) => setItem(i, { unitCode: e.target.value })} className="!mt-0">
                    {units.map((u) => (
                      <option key={u.code} value={u.code}>
                        {u.code}
                      </option>
                    ))}
                  </Select>
                  <IconButton variant="ghost" size="sm" icon={Trash2} aria-label="Quitar insumo" onClick={() => setRecipe((prev) => prev.filter((_, j) => j !== i))} />
                </li>
              ))}
            </ul>
          )}
          <p className={typography.caption}>
            Cantidad en la unidad base del insumo. Si una cocina ya tiene ese código con otra unidad, el guardado se detiene y lo indica.
          </p>
        </div>

        {error && (name || code || recipe.length > 0) && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <FormActions>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={saving} disabled={Boolean(error)}>
            {product ? 'Guardar plato' : 'Agregar plato'}
          </Button>
        </FormActions>
      </form>
    </Drawer>
  )
}
