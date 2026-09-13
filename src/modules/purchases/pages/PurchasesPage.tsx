import { useSuppliers } from '@/modules/suppliers/hooks/useSuppliers'
import {
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  tableWrapperClass,
  tdClass,
  thClass,
} from '@/shared/ui/formClasses'
import { ArrowRight, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreatePurchase, usePurchases } from '../hooks/usePurchases'
import { getErrorMessage } from '@/shared/utils/errors'

const STATUS_LABEL: Record<string, string> = {
  BORRADOR: 'Borrador',
  CONFIRMADA: 'Confirmada',
  ANULADA: 'Anulada',
}

const STATUS_BADGE: Record<string, string> = {
  BORRADOR: 'bg-neutral-700 text-neutral-200',
  CONFIRMADA: 'bg-emerald-500/20 text-emerald-400',
  ANULADA: 'bg-red-500/20 text-red-400',
}

export function PurchasesPage() {
  const { data: purchases, isLoading } = usePurchases()
  const { data: suppliers } = useSuppliers()
  const createPurchase = useCreatePurchase()
  const navigate = useNavigate()

  const [supplierId, setSupplierId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const purchase = await createPurchase.mutateAsync({ supplierId, invoiceNumber, invoiceDate })
      navigate(`/purchases/${purchase.id}`)
    } catch (err) {
      setError(getErrorMessage(err, 'Error al crear la compra'))
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-50">Compras</h1>

      <form onSubmit={handleCreate} className={`${cardClass} grid grid-cols-1 gap-4 sm:grid-cols-4`}>
        <div>
          <label className={labelClass}>Proveedor *</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass} required>
            <option value="">Selecciona…</option>
            {suppliers?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>N.º de factura *</label>
          <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={inputClass} required />
        </div>
        <div>
          <label className={labelClass}>Fecha *</label>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className={inputClass}
            required
          />
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={createPurchase.isPending} className={primaryButtonClass}>
            <Plus size={15} /> Crear borrador
          </button>
        </div>
        {error && <p className="text-sm text-red-400 sm:col-span-4">{error}</p>}
      </form>

      <div className={tableWrapperClass}>
        <table className="min-w-full divide-y divide-neutral-800">
          <thead className="bg-neutral-900">
            <tr>
              <th className={thClass}>Factura</th>
              <th className={thClass}>Proveedor</th>
              <th className={thClass}>Fecha</th>
              <th className={thClass}>Total</th>
              <th className={thClass}>Estado</th>
              <th className={thClass}></th>
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
            {purchases?.map((p) => (
              <tr
                key={p.id}
                onClick={() => navigate(`/purchases/${p.id}`)}
                className="cursor-pointer transition-colors hover:bg-neutral-900"
              >
                <td className={tdClass}>{p.invoiceNumber}</td>
                <td className={tdClass}>{p.supplierName}</td>
                <td className={tdClass}>{p.invoiceDate}</td>
                <td className={tdClass}>${p.total.toFixed(2)}</td>
                <td className={tdClass}>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status]}`}>
                    {STATUS_LABEL[p.status]}
                  </span>
                </td>
                <td className={`${tdClass} text-right`}>
                  <span className="inline-flex items-center gap-1 text-brasa-500 hover:underline">
                    Ver <ArrowRight size={13} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
