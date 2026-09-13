import {
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  tableWrapperClass,
  tdClass,
  thClass,
} from '@/shared/ui/formClasses'
import { useToast } from '@/shared/ui/Toast'
import {
  ArrowDownCircle,
  ArrowLeft,
  ArrowUpCircle,
  History,
  ShoppingBag,
  SlidersHorizontal,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useIngredients } from '../hooks/useIngredients'
import { useMovements, useRegisterAdjustment, useRegisterWaste } from '../hooks/useMovements'
import type { WasteReason } from '../types'
import { getErrorMessage } from '@/shared/utils/errors'

const MOVEMENT_ICON: Record<string, typeof ShoppingBag> = {
  COMPRA: ShoppingBag,
  MERMA: Trash2,
  AJUSTE: SlidersHorizontal,
  CONSUMO: ArrowDownCircle,
  DEVOLUCION: Undo2,
}

const MOVEMENT_COLOR: Record<string, string> = {
  COMPRA: 'text-emerald-400',
  MERMA: 'text-red-400',
  AJUSTE: 'text-neutral-300',
  CONSUMO: 'text-brasa-400',
  DEVOLUCION: 'text-emerald-400',
}

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
  const { show } = useToast()
  const [ingredientId, setIngredientId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState<WasteReason>('DANO')
  const [observation, setObservation] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const ingredientName = ingredients?.find((i) => i.id === ingredientId)?.name ?? 'Insumo'
      await registerWaste.mutateAsync({
        ingredientId,
        quantity: Number(quantity),
        reason,
        observation: observation || undefined,
      })
      setIngredientId('')
      setQuantity('')
      setObservation('')
      show(`Merma registrada: ${quantity} de ${ingredientName}.`)
    } catch (err) {
      const message = getErrorMessage(err, 'Error al registrar la merma')
      setError(message)
      show(message, 'error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`${cardClass} space-y-3`}>
      <h2 className="flex items-center gap-1.5 font-medium text-neutral-100">
        <Trash2 size={16} className="text-red-400" /> Registrar merma
      </h2>
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
        <Trash2 size={15} /> Registrar merma
      </button>
    </form>
  )
}

function AdjustmentForm() {
  const { data: ingredients } = useIngredients()
  const registerAdjustment = useRegisterAdjustment()
  const { show } = useToast()
  const [ingredientId, setIngredientId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [observation, setObservation] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const ingredientName = ingredients?.find((i) => i.id === ingredientId)?.name ?? 'Insumo'
      await registerAdjustment.mutateAsync({
        ingredientId,
        quantity: Number(quantity),
        observation: observation || undefined,
      })
      setIngredientId('')
      setQuantity('')
      setObservation('')
      show(`Ajuste registrado en ${ingredientName}.`)
    } catch (err) {
      const message = getErrorMessage(err, 'Error al registrar el ajuste')
      setError(message)
      show(message, 'error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`${cardClass} space-y-3`}>
      <h2 className="flex items-center gap-1.5 font-medium text-neutral-100">
        <SlidersHorizontal size={16} className="text-neutral-300" /> Registrar ajuste manual
      </h2>
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
        <SlidersHorizontal size={15} /> Registrar ajuste
      </button>
    </form>
  )
}

export function MovementsPage() {
  const { data: movements, isLoading } = useMovements()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History size={22} className="text-brasa-500" />
          <h1 className="text-2xl font-semibold text-neutral-50">Movimientos de inventario</h1>
        </div>
        <Link to="/inventory" className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-200">
          <ArrowLeft size={14} /> Volver a insumos
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
            {movements?.map((m) => {
              const Icon = MOVEMENT_ICON[m.movementType] ?? ArrowUpCircle
              return (
                <tr key={m.id}>
                  <td className={tdClass}>{new Date(m.createdAt).toLocaleString()}</td>
                  <td className={tdClass}>{m.ingredientName}</td>
                  <td className={tdClass}>
                    <span className={`inline-flex items-center gap-1.5 ${MOVEMENT_COLOR[m.movementType]}`}>
                      <Icon size={14} /> {MOVEMENT_LABEL[m.movementType]}
                    </span>
                  </td>
                  <td className={`${tdClass} ${m.quantityBaseUnit < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {m.quantityBaseUnit > 0 ? '+' : ''}
                    {m.quantityBaseUnit}
                  </td>
                  <td className={tdClass}>{m.unitCost !== null ? `$${m.unitCost.toFixed(2)}` : '—'}</td>
                  <td className={tdClass}>{m.reason ?? m.observation ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
