import { Button } from '@/shared/ui/Button'
import { Drawer } from '@/shared/ui/Drawer'
import { FormField, Input, Select } from '@/shared/ui/FormField'
import { NumberInput } from '@/shared/ui/NumberInput'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { useIngredientUnits } from '@/shared/hooks/useIngredientUnits'
import { compatibleUnits, equivalence, formatNumber, formatQuantity, toBase, unitLabel } from '@/shared/units/conversion'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { CookingPot } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useRegisterProduction } from '../hooks/usePreparations'
import type { PreparationDetail } from '../types'

/**
 * ADR 0057: preparing a batch. Shows, before anything moves, what goes out of
 * the inventory (with what there is), what should come in and its cost; the
 * database does it all at once and keeps the batch for traceability.
 */
export function ProductionDrawer({ preparation, open, onClose }: { preparation: PreparationDetail; open: boolean; onClose: () => void }) {
  const register = useRegisterProduction(preparation.id)
  const { show } = useToast()
  const { units, infoFor } = useIngredientUnits()
  const [batches, setBatches] = useState<number | null>(1)
  const [actual, setActual] = useState<number | null>(null)
  const [unitCode, setUnitCode] = useState<string | null>(null)
  const [observation, setObservation] = useState('')
  const [error, setError] = useState<string | null>(null)

  const info = infoFor({ id: preparation.id, baseUnitCode: preparation.baseUnitCode })
  const unitOptions = compatibleUnits(info, units)
  const currentUnit = unitCode ?? preparation.baseUnitCode
  const n = batches ?? 0
  const expected = (preparation.recipe?.yieldQuantity ?? 0) * n
  const actualBase = actual === null ? expected : (toBase(actual, currentUnit, info, units) ?? 0)
  const lines = preparation.items.map((item) => {
    const needed = item.quantity * n
    return { ...item, needed, enough: item.stockAvailable >= needed, cost: needed * item.avgCost }
  })
  const totalCost = lines.reduce((sum, l) => sum + l.cost, 0)
  const unitCost = actualBase > 0 ? totalCost / actualBase : 0
  const missing = lines.filter((l) => !l.enough)
  const variance = expected > 0 && actual !== null ? ((actualBase - expected) / expected) * 100 : null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!(n > 0)) {
      setError('Escribe cuántos lotes preparaste')
      return
    }
    try {
      const unitId = actual !== null && currentUnit !== preparation.baseUnitCode ? (units.find((u) => u.code === currentUnit)?.id ?? null) : null
      const result = await register.mutateAsync({ batches: n, actualYield: actual, yieldUnitId: unitId, observation: observation.trim() || null })
      show(
        `Lote registrado: entran ${formatQuantity(result.actualYield, preparation.baseUnitCode)} de ${preparation.name} a ${formatMoney(result.unitCost, { decimals: 'auto' })}/${preparation.baseUnitCode}.`,
      )
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo registrar el lote'))
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Preparar lote" subtitle={preparation.name} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField
          label="Lotes"
          required
          info="Cuántas veces preparaste la receta. Puede ser medio lote (0,5)."
          hint={preparation.recipe ? `Rinde ${formatQuantity(expected, preparation.baseUnitCode)} según la receta (v${preparation.recipe.version}).` : undefined}
        >
          {(a11y) => <NumberInput {...a11y} value={batches} onValueChange={setBatches} decimals={2} min={0} required className="!mt-0 w-32" />}
        </FormField>

        <FormField
          label="Rendimiento real"
          info="Lo que realmente salió. Si lo dejas vacío, se toma lo que dice la receta. Un rendimiento menor encarece cada unidad."
          hint={
            [actual !== null ? equivalence(actual, currentUnit, info, units) : null, variance !== null ? `${variance >= 0 ? '+' : ''}${formatNumber(variance)} % frente a lo esperado` : null]
              .filter(Boolean)
              .join(' · ') || undefined
          }
        >
          {(a11y) => (
            <span className="flex gap-2">
              <NumberInput {...a11y} value={actual} onValueChange={setActual} decimals={3} min={0} placeholder={formatNumber(expected)} className="!mt-0 flex-1" />
              <Select
                aria-label="Unidad del rendimiento"
                value={currentUnit}
                onChange={(e) => setUnitCode(e.target.value === preparation.baseUnitCode ? null : e.target.value)}
                disabled={unitOptions.length <= 1}
                className="!mt-0 w-32"
              >
                {(unitOptions.length ? unitOptions : [{ code: preparation.baseUnitCode }]).map((u) => (
                  <option key={u.code} value={u.code}>
                    {unitLabel(u.code, 2)}
                  </option>
                ))}
              </Select>
            </span>
          )}
        </FormField>

        <div className="rounded-xl border border-neutral-800/60">
          <p className="border-b border-neutral-800/60 px-3 py-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Sale del inventario</p>
          <ul className="divide-y divide-neutral-800/60" aria-label="Lo que se descuenta">
            {lines.map((l) => (
              <li key={l.ingredientId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="text-neutral-100">{l.name}</span>
                  <span className={clsx('block text-xs', l.enough ? 'text-neutral-500' : 'text-red-400')}>
                    hay {formatQuantity(l.stockAvailable, l.unitCode)}
                    {!l.enough && (l.isPreparation ? ' · prepara un lote primero' : ' · no alcanza')}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  <span className="block text-neutral-100">{formatQuantity(l.needed, l.unitCode)}</span>
                  <span className="block text-xs text-neutral-500">{formatMoney(l.cost)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-neutral-800/60 px-3 py-2.5">
            <p className={typography.caption}>Entra al inventario</p>
            <p className="text-lg font-semibold text-neutral-50 tabular-nums">{formatQuantity(actualBase, preparation.baseUnitCode)}</p>
          </div>
          <div className="rounded-xl border border-neutral-800/60 px-3 py-2.5">
            <p className={typography.caption}>Costo del lote</p>
            <p className="text-lg font-semibold text-neutral-50 tabular-nums">{formatMoney(totalCost)}</p>
            <p className={typography.caption}>
              {formatMoney(unitCost, { decimals: 'auto' })} / {preparation.baseUnitCode}
              {preparation.portion ? ` · ${formatMoney(unitCost * preparation.portion)} / porción` : ''}
            </p>
          </div>
        </div>

        <FormField label="Observación">
          {(a11y) => <Input {...a11y} value={observation} onChange={(e) => setObservation(e.target.value)} maxLength={500} placeholder="Opcional" />}
        </FormField>

        {missing.length > 0 && (
          <p role="status" className="text-sm text-amber-400">
            No alcanza {missing.map((m) => m.name).join(', ')}. Compra o prepara lo que falta, o prepara menos lotes.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" icon={CookingPot} loading={register.isPending} disabled={!preparation.recipe || missing.length > 0} className="w-full">
          Registrar lote
        </Button>
      </form>
    </Drawer>
  )
}
