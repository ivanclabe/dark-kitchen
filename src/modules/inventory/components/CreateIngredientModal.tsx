import { useUnits } from '@/shared/hooks/useUnits'
import { Modal } from '@/shared/ui/Modal'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/shared/ui/formClasses'
import { useToast } from '@/shared/ui/Toast'
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
      <div>
        <label className={labelClass}>Código *</label>
        <input value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} required autoFocus />
      </div>
      <div>
        <label className={labelClass}>Nombre *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
      </div>
      <div>
        <label className={labelClass}>Unidad base *</label>
        <select value={baseUnitId} onChange={(e) => setBaseUnitId(e.target.value)} className={inputClass} required>
          <option value="">Selecciona…</option>
          {units?.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name} ({unit.code})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Stock mínimo</label>
        <input type="number" step="any" min="0" value={minStock} onChange={(e) => setMinStock(e.target.value)} className={inputClass} />
      </div>
      <p className="text-xs text-neutral-500">
        Categoría, proveedor principal y demás datos se pueden completar después desde Inventario.
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button type="submit" disabled={createIngredient.isPending} className={primaryButtonClass}>
          {createIngredient.isPending ? 'Creando…' : 'Crear insumo'}
        </button>
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
