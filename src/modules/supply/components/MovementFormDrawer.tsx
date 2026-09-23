import { Button } from '@/shared/ui/Button'
import { Chip } from '@/shared/ui/Chip'
import { Drawer } from '@/shared/ui/Drawer'
import { FormField, Input, Select } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { SlidersHorizontal, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useIngredients } from '../hooks/useIngredients'
import { useRegisterAdjustment, useRegisterWaste } from '../hooks/useMovements'
import { WASTE_REASONS } from '../lib/movementVisuals'
import type { WasteReason } from '../types'

export type MovementMode = 'merma' | 'ajuste'

/**
 * Merma y ajuste manual en un solo Drawer — mismas RPC (dk_register_waste /
 * dk_register_adjustment) y mismas validaciones que los dos formularios
 * separados de la antigua MovementsPage. Si se abre desde el detalle de un
 * insumo llega `ingredientId` prefijado.
 */
export function MovementFormDrawer({
  open,
  mode: initialMode,
  ingredientId: initialIngredientId,
  onClose,
}: {
  open: boolean
  mode: MovementMode
  ingredientId?: string
  onClose: () => void
}) {
  const { data: ingredients } = useIngredients()
  const registerWaste = useRegisterWaste()
  const registerAdjustment = useRegisterAdjustment()
  const { show } = useToast()

  const [mode, setMode] = useState<MovementMode>(initialMode)
  const [ingredientId, setIngredientId] = useState(initialIngredientId ?? '')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState<WasteReason>('DANO')
  const [observation, setObservation] = useState('')
  const [error, setError] = useState<string | null>(null)

  const ingredient = ingredients?.find((i) => i.id === ingredientId)
  const pending = registerWaste.isPending || registerAdjustment.isPending

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const name = ingredient?.name ?? 'Insumo'
    try {
      if (mode === 'merma') {
        await registerWaste.mutateAsync({ ingredientId, quantity: Number(quantity), reason, observation: observation || undefined })
        show(`Merma registrada: ${quantity} de ${name}.`)
      } else {
        await registerAdjustment.mutateAsync({ ingredientId, quantity: Number(quantity), observation: observation || undefined })
        show(`Ajuste registrado en ${name}.`)
      }
      onClose()
    } catch (err) {
      const message = getErrorMessage(err, mode === 'merma' ? 'Error al registrar la merma' : 'Error al registrar el ajuste')
      setError(message)
      show(message, 'error')
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Registrar movimiento" subtitle={ingredient?.name} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2" role="group" aria-label="Tipo de movimiento">
          <Chip label="Merma" active={mode === 'merma'} onClick={() => setMode('merma')} />
          <Chip label="Ajuste manual" active={mode === 'ajuste'} onClick={() => setMode('ajuste')} />
        </div>

        <FormField label="Insumo" required>
          {(a11y) => (
            <Select {...a11y} value={ingredientId} onChange={(e) => setIngredientId(e.target.value)} required>
              <option value="">Selecciona…</option>
              {ingredients?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.baseUnitCode})
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField
          label={mode === 'merma' ? `Cantidad${ingredient ? ` (${ingredient.baseUnitCode})` : ' (unidad base)'}` : 'Cantidad (unidad base, +/-)'}
          required
          hint={mode === 'merma' ? 'Se registra como salida automáticamente.' : 'Positivo suma stock, negativo resta.'}
        >
          {(a11y) => (
            <Input
              {...a11y}
              type="number"
              step="any"
              min={mode === 'merma' ? '0' : undefined}
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          )}
        </FormField>

        {mode === 'merma' && (
          <FormField label="Motivo">
            {(a11y) => (
              <Select {...a11y} value={reason} onChange={(e) => setReason(e.target.value as WasteReason)}>
                {WASTE_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        )}

        <FormField label="Observación" error={error}>
          {(a11y) => <Input {...a11y} value={observation} onChange={(e) => setObservation(e.target.value)} />}
        </FormField>

        <Button
          type="submit"
          variant="primary"
          icon={mode === 'merma' ? Trash2 : SlidersHorizontal}
          loading={pending}
          disabled={!ingredientId || quantity === ''}
          className="w-full"
        >
          {mode === 'merma' ? 'Registrar merma' : 'Registrar ajuste'}
        </Button>
      </form>
    </Drawer>
  )
}
