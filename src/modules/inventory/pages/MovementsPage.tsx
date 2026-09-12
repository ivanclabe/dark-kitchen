import {
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  tableWrapperClass,
  tdClass,
  thClass,
} from '@/shared/ui/formClasses'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useIngredients } from '../hooks/useIngredients'
import { useMovements, useRegisterAdjustment, useRegisterWaste } from '../hooks/useMovements'
import type { WasteReason } from '../types'

const WASTE_REASONS: { value: WasteReason; label: string }[] = [
  { value: 'VENCIMIENTO', label: 'Vencimiento' },
  { value: 'DANO', label: 'Daño' },
  { value: 'ERROR_PREPARACION', label: 'Error de preparación' },
  { value: 'OTRO', label: 'Otro' },
]

const MOVEMENT_LABEL: Record<string, string> = {
  COMPRA: 'Compra',
  MERMA: 'Merma',
  AJUSTE: 'Ajuste',
  CONSUMO: 'Consumo',
  DEVOLUCION: 'Devolución',
}

function WasteForm() {
  const { data: ingredients } = useIngredients()
  const registerWaste = useRegisterWaste()
  const [ingredientId, setIngredientId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState<WasteReason>('DANO')
  const [observation, setObservation] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await registerWaste.mutateAsync({
        ingredientId,
        quantity: Number(quantity),
        reason,
        observation: observation || undefined,
      })
      setIngredientId('')
      setQuantity('')
      setObservation('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar la merma')
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`${cardClass} space-y-3`}>
      <h2 className="font-medium text-neutral-100">Registrar merma</h2>
      <div>
        <label className={labelClass}>Insumo</label>
        <select value={ingredientId} onChange={(e) => setIngredientId(e.target.value)} className={inputClass} required>
          <option value="">Selecciona…</option>
          {ingredients?.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.baseUnitCode})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Cantidad (unidad base)</label>
        <input
          type="number"
          step="any"
          min="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className={inputClass}
          required
        />
      </div>
      <div>
        <label className={labelClass}>Motivo</label>
        <select value={reason} onChange={(e) => setReason(e.target.value as WasteReason)} className={inputClass}>
          {WASTE_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Observación</label>
        <input value={observation} onChange={(e) => setObservation(e.target.value)} className={inputClass} />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={registerWaste.isPending} className={primaryButtonClass}>
        Registrar merma
      </button>
    </form>
  )
}

function AdjustmentForm() {
  const { data: ingredients } = useIngredients()
  const registerAdjustment = useRegisterAdjustment()
  const [ingredientId, setIngredientId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [observation, setObservation] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await registerAdjustment.mutateAsync({
        ingredientId,
        quantity: Number(quantity),
        observation: observation || undefined,
      })
      setIngredientId('')
      setQuantity('')
      setObservation('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar el ajuste')
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`${cardClass} space-y-3`}>
      <h2 className="font-medium text-neutral-100">Registrar ajuste manual</h2>
      <p className="text-xs text-neutral-500">Usa un valor positivo para sumar stock, negativo para restar.</p>
      <div>
        <label className={labelClass}>Insumo</label>
        <select value={ingredientId} onChange={(e) => setIngredientId(e.target.value)} className={inputClass} required>
          <option value="">Selecciona…</option>
          {ingredients?.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.baseUnitCode})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Cantidad (unidad base, +/-)</label>
        <input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} required />
      </div>
      <div>
        <label className={labelClass}>Observación</label>
        <input value={observation} onChange={(e) => setObservation(e.target.value)} className={inputClass} />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={registerAdjustment.isPending} className={primaryButtonClass}>
        Registrar ajuste
      </button>
    </form>
  )
}

export function MovementsPage() {
  const { data: movements, isLoading } = useMovements()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-50">Movimientos de inventario</h1>
        <Link to="/inventory" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← Volver a insumos
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <WasteForm />
        <AdjustmentForm />
      </div>

      <div className={tableWrapperClass}>
        <table className="min-w-full divide-y divide-neutral-800">
          <thead className="bg-neutral-900">
            <tr>
              <th className={thClass}>Fecha</th>
              <th className={thClass}>Insumo</th>
              <th className={thClass}>Tipo</th>
              <th className={thClass}>Cantidad</th>
              <th className={thClass}>Costo unit.</th>
              <th className={thClass}>Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {isLoading && (
              <tr>
                <td className={tdClass} colSpan={6}>
                  Cargando…
                </td>
              </tr>
            )}
            {movements?.map((m) => (
              <tr key={m.id}>
                <td className={tdClass}>{new Date(m.createdAt).toLocaleString()}</td>
                <td className={tdClass}>{m.ingredientName}</td>
                <td className={tdClass}>{MOVEMENT_LABEL[m.movementType]}</td>
                <td className={`${tdClass} ${m.quantityBaseUnit < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {m.quantityBaseUnit > 0 ? '+' : ''}
                  {m.quantityBaseUnit}
                </td>
                <td className={tdClass}>{m.unitCost !== null ? `$${m.unitCost.toFixed(2)}` : '—'}</td>
                <td className={tdClass}>{m.reason ?? m.observation ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
