import { Button } from '@/shared/ui/Button'
import { NumberInput } from '@/shared/ui/NumberInput'
import { Chip } from '@/shared/ui/Chip'
import { Drawer } from '@/shared/ui/Drawer'
import { FormField, Input, Select } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { SlidersHorizontal, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useIngredientUnits } from '@/shared/hooks/useIngredientUnits'
import { compatibleUnits, equivalence, formatNumber } from '@/shared/units/conversion'
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
  const [quantity, setQuantity] = useState<number | null>(null)
  const [reason, setReason] = useState<WasteReason>('DANO')
  const [observation, setObservation] = useState('')
  // ADR 0056: any unit that converts («se dañó medio kilo» of an ingredient kept in grams).
  const [unitCode, setUnitCode] = useState<string | null>(null)
  const { units, infoFor } = useIngredientUnits()
  const [error, setError] = useState<string | null>(null)

  const ingredient = ingredients?.find((i) => i.id === ingredientId)
  const info = infoFor(ingredient)
  const unitOptions = compatibleUnits(info, units)
  const currentUnit = unitCode ?? ingredient?.baseUnitCode ?? null
  const unitId = currentUnit && currentUnit !== ingredient?.baseUnitCode ? (units.find((u) => u.code === currentUnit)?.id ?? null) : null
  const hint = quantity !== null ? equivalence(Math.abs(quantity), currentUnit, info, units) : null
  const pending = registerWaste.isPending || registerAdjustment.isPending

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const name = ingredient?.name ?? 'Insumo'
    try {
      if (mode === 'merma') {
        await registerWaste.mutateAsync({ ingredientId, quantity: quantity ?? 0, reason, observation: observation || undefined, unitId })
        show(`Merma registrada: ${formatNumber(quantity ?? 0)} ${currentUnit ?? ''} de ${name}.`)
      } else {
        await registerAdjustment.mutateAsync({ ingredientId, quantity: quantity ?? 0, observation: observation || undefined, unitId })
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
            <Select
              {...a11y}
              value={ingredientId}
              onChange={(e) => {
                setIngredientId(e.target.value)
                setUnitCode(null)
              }}
              required
            >
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
          label="Cantidad"
          required
          info={
            mode === 'merma'
              ? 'Lo que se perdió, en la unidad que quieras (se convierte a la del inventario). Sale del inventario al registrarla.'
              : 'Positiva suma al inventario; negativa (con «-») resta. Úsala para corregir el stock tras un conteo.'
          }
          hint={hint ?? undefined}
        >
          {(a11y) => (
            <span className="flex gap-2">
              <NumberInput
                {...a11y}
                value={quantity}
                onValueChange={setQuantity}
                decimals={3}
                min={mode === 'merma' ? 0 : undefined}
                allowNegative={mode !== 'merma'}
                required
                className="!mt-0 flex-1"
              />
              <Select
                aria-label="Unidad"
                value={currentUnit ?? ''}
                onChange={(e) => setUnitCode(e.target.value === ingredient?.baseUnitCode ? null : e.target.value)}
                disabled={!ingredient || unitOptions.length <= 1}
                className="!mt-0 w-28"
              >
                {(unitOptions.length ? unitOptions : ingredient ? [{ code: ingredient.baseUnitCode }] : []).map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.code}
                  </option>
                ))}
              </Select>
            </span>
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
          disabled={!ingredientId || quantity === null}
          className="w-full"
        >
          {mode === 'merma' ? 'Registrar merma' : 'Registrar ajuste'}
        </Button>
      </form>
    </Drawer>
  )
}
