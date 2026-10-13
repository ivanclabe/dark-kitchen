import { Button } from '@/shared/ui/Button'
import { Drawer } from '@/shared/ui/Drawer'
import { FormField, Input, Select } from '@/shared/ui/FormField'
import { useUnits } from '@/shared/hooks/useUnits'
import { getErrorMessage } from '@/shared/utils/errors'
import { CookingPot } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useCreatePreparation } from '../hooks/usePreparations'

/** The base units a preparation is kept in: weighed, measured or counted. */
const BASE_CHOICES = [
  { code: 'g', label: 'Gramos (g)' },
  { code: 'ml', label: 'Mililitros (ml)' },
  { code: 'unidad', label: 'Unidades' },
]

/**
 * ADR 0057: a new preparation is an ingredient made in batches. Its recipe
 * (lines, yield and portion) comes next, in the recipe editor.
 */
export function NewPreparationDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { data: units } = useUnits()
  const create = useCreatePreparation()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [baseCode, setBaseCode] = useState('g')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const baseUnitId = units?.find((u) => u.code === baseCode)?.id
    if (!name.trim() || !baseUnitId) {
      setError('Escribe el nombre y elige la unidad')
      return
    }
    try {
      const id = await create.mutateAsync({ name: name.trim(), baseUnitId, code: code.trim() || null })
      onCreated(id)
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo crear la preparación'))
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Nueva preparación" subtitle="Una salsa, una ensalada base, un fondo…" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Nombre" required>
          {(a11y) => <Input {...a11y} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Salsa de ajo" required autoFocus />}
        </FormField>
        <FormField
          label="Se guarda en"
          required
          info="La unidad de su inventario. Puedes escribir la receta, el rendimiento y los platos en otras compatibles (kg, l, porciones): se convierten solas."
        >
          {(a11y) => (
            <Select {...a11y} value={baseCode} onChange={(e) => setBaseCode(e.target.value)}>
              {BASE_CHOICES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Código" hint="Opcional: si lo dejas vacío, se crea uno (PREP-001).">
          {(a11y) => <Input {...a11y} value={code} onChange={(e) => setCode(e.target.value)} maxLength={30} />}
        </FormField>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" icon={CookingPot} loading={create.isPending} className="w-full">
          Crear y escribir su receta
        </Button>
      </form>
    </Drawer>
  )
}
