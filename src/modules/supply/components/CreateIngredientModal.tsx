import { useUnits } from '@/shared/hooks/useUnits'
import { Button } from '@/shared/ui/Button'
import { FormField, Input, Select } from '@/shared/ui/FormField'
import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useState, type FormEvent } from 'react'
import { useCreateIngredient } from '../hooks/useIngredients'
import type { Ingredient } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  initialQuery: string
  onCreated: (ingredient: Ingredient) => void
}

// Componente hijo separado: solo se instancia mientras open=true, así cada
// apertura es un montaje nuevo y los campos parten limpios.
function CreateIngredientForm({ initialQuery, onClose, onCreated }: Omit<Props, 'open'>) {
  const { data: units } = useUnits()
  const createIngredient = useCreateIngredient()
  const { show } = useToast()
  const [code, setCode] = useState('')
  const [name, setName] = useState(initialQuery)
  const [baseUnitId, setBaseUnitId] = useState('')
  const [minStock, setMinStock] = useState('0')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const ingredient = await createIngredient.mutateAsync({
        code,
        name,
        baseUnitId,
        minStock: Number(minStock),
        perishable: false,
      })
      show(`Insumo "${ingredient.name}" creado.`)
      onCreated(ingredient)
    } catch (err) {
      setError(getErrorMessage(err, 'Error al crear el insumo'))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Código" required error={error}>
        {(a11y) => <Input {...a11y} value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />}
      </FormField>
      <FormField label="Nombre" required>
        {(a11y) => <Input {...a11y} value={name} onChange={(e) => setName(e.target.value)} required />}
      </FormField>
      <FormField label="Unidad base" required>
        {(a11y) => (
          <Select {...a11y} value={baseUnitId} onChange={(e) => setBaseUnitId(e.target.value)} required>
            <option value="">Selecciona…</option>
            {units?.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.code})
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <FormField label="Stock mínimo" hint="Se marca “Bajo mínimo” cuando el disponible cae a este valor.">
        {(a11y) => <Input {...a11y} type="number" step="any" min="0" inputMode="decimal" value={minStock} onChange={(e) => setMinStock(e.target.value)} />}
      </FormField>
      <p className={typography.caption}>Categoría, proveedor principal y demás datos se pueden completar después desde Inventario.</p>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose} disabled={createIngredient.isPending}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={createIngredient.isPending}>
          Crear insumo
        </Button>
      </div>
    </form>
  )
}

export function CreateIngredientModal({ open, onClose, initialQuery, onCreated }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Crear insumo">
      {open && <CreateIngredientForm initialQuery={initialQuery} onClose={onClose} onCreated={onCreated} />}
    </Modal>
  )
}
