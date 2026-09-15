import { CreateIngredientModal } from '@/modules/inventory/components/CreateIngredientModal'
import { useIngredients } from '@/modules/inventory/hooks/useIngredients'
import type { Ingredient } from '@/modules/inventory/types'
import { useUnits } from '@/shared/hooks/useUnits'
import { Combobox } from '@/shared/ui/Combobox'
import { ConfirmDialog } from '@/shared/ui/Modal'
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
import { ArrowLeft, CheckCircle2, History, Paperclip, Plus, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  useAddPurchaseItem,
  useAttachmentUrl,
  useAttachments,
  useConfirmPurchase,
  useDeletePurchaseItem,
  useLastIngredientPrice,
  usePurchase,
  usePurchaseItems,
  useUploadAttachment,
} from '../hooks/usePurchases'
import { getErrorMessage } from '@/shared/utils/errors'

export function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const purchaseId = id ?? ''
  const { show } = useToast()

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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [createIngredientQuery, setCreateIngredientQuery] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: lastPrice } = useLastIngredientPrice(ingredientId)

  const isDraft = purchase?.status === 'BORRADOR'
  const total = items?.reduce((sum, item) => sum + item.lineTotal, 0) ?? 0

  const ingredientOptions = useMemo(
    () => ingredients?.map((i) => ({ value: i.id, label: i.name, sublabel: i.code })) ?? [],
    [ingredients],
  )

  function applyLastPrice() {
    if (!lastPrice) return
    setUnitCost(String(lastPrice.unitCost))
    setPurchaseUnitId(lastPrice.purchaseUnitId)
  }

  function handleIngredientCreated(ingredient: Ingredient) {
    setCreateIngredientQuery(null)
    setIngredientId(ingredient.id)
  }

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
      setConfirmOpen(false)
      show('Compra confirmada — inventario actualizado.')
    } catch (err) {
      const message = getErrorMessage(err, 'Error al confirmar la compra')
      setError(message)
      show(message, 'error')
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
          <p className="mt-1 flex items-center gap-2 text-sm text-neutral-400">
            <span>
              {purchase.supplierName} · {purchase.invoiceDate}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                purchase.status === 'CONFIRMADA' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-700 text-neutral-200'
              }`}
            >
              {purchase.status}
            </span>
          </p>
        </div>
        <Link to="/purchases" className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-200">
          <ArrowLeft size={14} /> Volver a compras
        </Link>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {isDraft && (
        <form onSubmit={handleAddItem} className={`${cardClass} grid grid-cols-1 gap-4 sm:grid-cols-5`}>
          <div className="sm:col-span-2">
            <label className={labelClass}>Insumo</label>
            <Combobox
              value={ingredientId}
              onChange={setIngredientId}
              options={ingredientOptions}
              placeholder="Nombre o código…"
              emptyMessage="Sin insumos con ese nombre o código"
              onCreateNew={(query) => setCreateIngredientQuery(query)}
              required
            />
            {lastPrice && (
              <button
                type="button"
                onClick={applyLastPrice}
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-brasa-400 hover:underline"
              >
                <History size={11} /> Último: ${lastPrice.unitCost.toFixed(2)}/{lastPrice.purchaseUnitCode} ·{' '}
                {lastPrice.supplierName} · usar
              </button>
            )}
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
              <Plus size={15} /> Agregar línea
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
                    <button
                      onClick={() => deleteItem.mutate(item.id)}
                      className="inline-flex items-center gap-1 text-neutral-400 hover:text-red-400 hover:underline"
                    >
                      <Trash2 size={13} /> Quitar
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
        <h2 className="flex items-center gap-1.5 font-medium text-neutral-100">
          <Paperclip size={15} /> Adjuntos (factura escaneada, fotos)
        </h2>
        <input ref={fileInputRef} type="file" onChange={handleFileChange} className="text-sm text-neutral-300" />
        <ul className="space-y-1">
          {attachments?.map((a) => (
            <li key={a.id}>
              <button onClick={() => handleOpenAttachment(a.filePath)} className="text-sm text-brasa-500 hover:underline">
                {a.fileName}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {isDraft && (
        <div className="flex justify-end">
          <button onClick={() => setConfirmOpen(true)} disabled={!items?.length} className={primaryButtonClass}>
            <CheckCircle2 size={15} /> Confirmar compra
          </button>
        </div>
      )}
      {!isDraft && (
        <p className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
          <CheckCircle2 size={15} /> Compra confirmada — inventario actualizado.
        </p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
        title="Confirmar compra"
        confirmLabel="Sí, confirmar"
        pending={confirmPurchase.isPending}
        description={
          <p>
            Esto genera movimientos de <strong>entrada de inventario</strong> por cada línea (${total.toFixed(2)} en
            total) y actualiza el costo promedio de los insumos. No se puede deshacer — para corregir un error habría
            que registrar un ajuste manual después.
          </p>
        }
      />

      <CreateIngredientModal
        open={createIngredientQuery !== null}
        onClose={() => setCreateIngredientQuery(null)}
        initialQuery={createIngredientQuery ?? ''}
        onCreated={handleIngredientCreated}
      />
    </div>
  )
}
