import { useIngredients } from '@/modules/inventory/hooks/useIngredients'
import { useUnits } from '@/shared/hooks/useUnits'
import {
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  tableWrapperClass,
  tdClass,
  thClass,
} from '@/shared/ui/formClasses'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  useAddPurchaseItem,
  useAttachmentUrl,
  useAttachments,
  useConfirmPurchase,
  useDeletePurchaseItem,
  usePurchase,
  usePurchaseItems,
  useUploadAttachment,
} from '../hooks/usePurchases'
import { getErrorMessage } from '@/shared/utils/errors'

export function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const purchaseId = id ?? ''

  const { data: purchase, isLoading } = usePurchase(purchaseId)
  const { data: items } = usePurchaseItems(purchaseId)
  const { data: attachments } = useAttachments(purchaseId)
  const { data: ingredients } = useIngredients()
  const { data: units } = useUnits()

  const addItem = useAddPurchaseItem(purchaseId)
  const deleteItem = useDeletePurchaseItem(purchaseId)
  const confirmPurchase = useConfirmPurchase(purchaseId)
  const uploadAttachment = useUploadAttachment(purchaseId)
  const attachmentUrl = useAttachmentUrl()

  const [ingredientId, setIngredientId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [purchaseUnitId, setPurchaseUnitId] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isDraft = purchase?.status === 'BORRADOR'
  const total = items?.reduce((sum, item) => sum + item.lineTotal, 0) ?? 0

  async function handleAddItem(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await addItem.mutateAsync({
        ingredientId,
        quantity: Number(quantity),
        purchaseUnitId,
        unitCost: Number(unitCost),
      })
      setIngredientId('')
      setQuantity('')
      setPurchaseUnitId('')
      setUnitCost('')
    } catch (err) {
      setError(getErrorMessage(err, 'Error al agregar la línea'))
    }
  }

  async function handleConfirm() {
    setError(null)
    try {
      await confirmPurchase.mutateAsync()
    } catch (err) {
      setError(getErrorMessage(err, 'Error al confirmar la compra'))
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      await uploadAttachment.mutateAsync(file)
    } catch (err) {
      setError(getErrorMessage(err, 'Error al subir el archivo'))
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleOpenAttachment(filePath: string) {
    const url = await attachmentUrl.mutateAsync(filePath)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (isLoading || !purchase) return <p className="text-neutral-400">Cargando…</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-50">Factura {purchase.invoiceNumber}</h1>
          <p className="text-sm text-neutral-400">
            {purchase.supplierName} · {purchase.invoiceDate} ·{' '}
            <span className={purchase.status === 'CONFIRMADA' ? 'text-emerald-400' : 'text-neutral-300'}>
              {purchase.status}
            </span>
          </p>
        </div>
        <Link to="/purchases" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← Volver a compras
        </Link>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {isDraft && (
        <form onSubmit={handleAddItem} className={`${cardClass} grid grid-cols-1 gap-4 sm:grid-cols-5`}>
          <div className="sm:col-span-2">
            <label className={labelClass}>Insumo</label>
            <select value={ingredientId} onChange={(e) => setIngredientId(e.target.value)} className={inputClass} required>
              <option value="">Selecciona…</option>
              {ingredients?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Cantidad</label>
            <input type="number" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Unidad de compra</label>
            <select value={purchaseUnitId} onChange={(e) => setPurchaseUnitId(e.target.value)} className={inputClass} required>
              <option value="">Selecciona…</option>
              {units?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Costo unitario</label>
            <input type="number" step="any" min="0" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className={inputClass} required />
          </div>
          <div className="flex items-end sm:col-span-5">
            <button type="submit" disabled={addItem.isPending} className={primaryButtonClass}>
              Agregar línea
            </button>
          </div>
        </form>
      )}

      <div className={tableWrapperClass}>
        <table className="min-w-full divide-y divide-neutral-800">
          <thead className="bg-neutral-900">
            <tr>
              <th className={thClass}>Insumo</th>
              <th className={thClass}>Cantidad</th>
              <th className={thClass}>Unidad</th>
              <th className={thClass}>Costo unit.</th>
              <th className={thClass}>Total línea</th>
              {isDraft && <th className={thClass}></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {items?.map((item) => (
              <tr key={item.id}>
                <td className={tdClass}>{item.ingredientName}</td>
                <td className={tdClass}>{item.quantity}</td>
                <td className={tdClass}>{item.purchaseUnitCode}</td>
                <td className={tdClass}>${item.unitCost.toFixed(2)}</td>
                <td className={tdClass}>${item.lineTotal.toFixed(2)}</td>
                {isDraft && (
                  <td className={`${tdClass} text-right`}>
                    <button onClick={() => deleteItem.mutate(item.id)} className="text-neutral-400 hover:underline">
                      Quitar
                    </button>
                  </td>
                )}
              </tr>
            ))}
            <tr>
              <td className={`${tdClass} font-medium`} colSpan={4}>
                Total
              </td>
              <td className={`${tdClass} font-medium`}>${total.toFixed(2)}</td>
              {isDraft && <td className={tdClass}></td>}
            </tr>
          </tbody>
        </table>
      </div>

      <div className={`${cardClass} space-y-3`}>
        <h2 className="font-medium text-neutral-100">Adjuntos (factura escaneada, fotos)</h2>
        <input ref={fileInputRef} type="file" onChange={handleFileChange} className="text-sm text-neutral-300" />
        <ul className="space-y-1">
          {attachments?.map((a) => (
            <li key={a.id}>
              <button onClick={() => handleOpenAttachment(a.filePath)} className="text-sm text-orange-500 hover:underline">
                {a.fileName}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {isDraft && (
        <div className="flex justify-end">
          <button
            onClick={handleConfirm}
            disabled={confirmPurchase.isPending || !items?.length}
            className={primaryButtonClass}
          >
            Confirmar compra (genera movimientos de inventario)
          </button>
        </div>
      )}
      {!isDraft && (
        <p className={secondaryButtonClass + ' inline-block cursor-default'}>
          Compra confirmada — inventario actualizado.
        </p>
      )}
    </div>
  )
}
