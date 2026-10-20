import { useUnits } from '@/shared/hooks/useUnits'
import { NumberInput } from '@/shared/ui/NumberInput'
import { Button } from '@/shared/ui/Button'
import { FormField, Input, Select } from '@/shared/ui/FormField'
import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { canBeBaseUnit } from '@/shared/units/conversion'
import { useState, type FormEvent } from 'react'
import { duplicateIngredientId } from '../api/ingredients'
import { useCreateIngredient, useIngredients } from '../hooks/useIngredients'
import type { Ingredient } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  initialQuery: string
  onCreated: (ingredient: Ingredient) => void
}

// Componente hijo separado: solo se instancia mientras open=true, así cada
// apertura es un montaje nuevo y los campos parten limpios.
// ADR 0069: from a purchase or a recipe. The ingredient starts at zero stock; if the name already exists, the
// existing one is offered instead of a duplicate.
function CreateIngredientForm({ initialQuery, onClose, onCreated }: Omit<Props, 'open'>) {
  const { data: units } = useUnits()
  const { data: ingredients } = useIngredients()
  const createIngredient = useCreateIngredient()
  const { show } = useToast()
  const [code, setCode] = useState('')
  const [name, setName] = useState(initialQuery)
  const [baseUnitId, setBaseUnitId] = useState('')
  const [minStock, setMinStock] = useState<number | null>(0)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState<Ingredient | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setExisting(null)
    try {
      const ingredient = await createIngredient.mutateAsync({
        code,
        name,
        baseUnitId,
        minStock: minStock ?? 0,
        perishable: false,
      })
      show(`Insumo "${ingredient.name}" creado.`)
      onCreated(ingredient)
    } catch (err) {
      setError(getErrorMessage(err, 'Error al crear el insumo'))
      const duplicateId = duplicateIngredientId(err)
      setExisting(ingredients?.find((i) => i.id === duplicateId && i.active) ?? null)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Nombre" required error={error}>
        {(a11y) => <Input {...a11y} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />}
      </FormField>
      {existing && (
        <Button variant="secondary" size="sm" onClick={() => onCreated(existing)}>
          Usar «{existing.name}»
        </Button>
      )}
      <FormField label="Código" info="Si lo dejas vacío, quanela le pone uno (INS-001, INS-002…).">
        {(a11y) => <Input {...a11y} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Se genera solo" />}
      </FormField>
      <FormField label="Unidad base" required>
        {(a11y) => (
          <Select {...a11y} value={baseUnitId} onChange={(e) => setBaseUnitId(e.target.value)} required>
            <option value="">Selecciona…</option>
            {units
              ?.filter((unit) => canBeBaseUnit(unit.code))
              .map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} ({unit.code})
                  {['g', 'ml', 'unidad'].includes(unit.code) ? ' · recomendada' : ''}
                </option>
              ))}
          </Select>
        )}
      </FormField>
      <FormField label="Stock mínimo" info="Cuando el disponible llega a esta cantidad, el insumo se marca «Bajo mínimo» y aparece en «Reponer».">
        {(a11y) => <NumberInput {...a11y} value={minStock} onValueChange={setMinStock} decimals={3} min={0} />}
      </FormField>
      <p className={typography.caption}>
        Queda en el inventario con existencia cero hasta que registres una compra. Categoría, proveedor y demás datos se completan después en Abastecimiento.
      </p>
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
