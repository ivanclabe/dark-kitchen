import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useUnits } from '@/shared/hooks/useUnits'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Combobox } from '@/shared/ui/Combobox'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { FormField, Input, Select } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { NumberStepper } from '@/shared/ui/NumberStepper'
import { useToast } from '@/shared/ui/Toast'
import { cardClass } from '@/shared/ui/formClasses'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate, formatMoney } from '@/shared/utils/format'
import { CheckCircle2, History, Paperclip, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { CreateIngredientModal } from './CreateIngredientModal'
import { useIngredients } from '../hooks/useIngredients'
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
import { PurchaseStatusBadge } from '../lib/purchaseStatus'
import type { Ingredient } from '../types'

/**
 * Detalle de compra: el flujo borrador → confirmar se mantiene exactamente
 * igual (mismas RPC, mismo guard de la base que impide editar una compra
 * confirmada, misma advertencia antes de confirmar). Solo cambia el envoltorio
 * visual: vive dentro del shell de Abastecimiento en vez de una página aparte.
 */
export function PurchaseDetail({ purchaseId }: { purchaseId: string }) {
  const { can } = useActiveKitchen()
  const { show } = useToast()
  const { data: purchase, isLoading, isError, error: purchaseError, refetch } = usePurchase(purchaseId)
  const { data: items, isLoading: itemsLoading, isError: itemsError, error: itemsErr, refetch: refetchItems } = usePurchaseItems(purchaseId)
  const { data: attachments } = useAttachments(purchaseId)
  const { data: ingredients } = useIngredients()
  const { data: units } = useUnits()

  const addItem = useAddPurchaseItem(purchaseId)
  const deleteItem = useDeletePurchaseItem(purchaseId)
  const confirmPurchase = useConfirmPurchase(purchaseId)
  const uploadAttachment = useUploadAttachment(purchaseId)
  const attachmentUrl = useAttachmentUrl()

  const [ingredientId, setIngredientId] = useState('')
  const [quantity, setQuantity] = useState(0)
  const [purchaseUnitId, setPurchaseUnitId] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [createIngredientQuery, setCreateIngredientQuery] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: lastPrice } = useLastIngredientPrice(ingredientId)

  const isDraft = purchase?.status === 'BORRADOR'
  // Borradores: los edita quien crea compras; confirmar (entra al inventario) es un permiso aparte.
  const canEditDraft = isDraft && can('purchasing.create')
  const canConfirm = isDraft && can('purchasing.confirm')
  const total = items?.reduce((sum, item) => sum + item.lineTotal, 0) ?? 0

  const ingredientOptions = useMemo(() => ingredients?.map((i) => ({ value: i.id, label: i.name, sublabel: i.code })) ?? [], [ingredients])

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
      await addItem.mutateAsync({ ingredientId, quantity, purchaseUnitId, unitCost: Number(unitCost) })
      setIngredientId('')
      setQuantity(0)
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
      show(`Adjunto "${file.name}" subido.`)
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

  if (isError) return <ErrorState error={purchaseError} onRetry={() => void refetch()} />
  if (isLoading || !purchase) return <LoadingState variant="block" label="Cargando compra…" />

  return (
    <div className="space-y-4">
      <div className={`${cardClass} space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-brasa-500/20 bg-brasa-500/10 text-brasa-400">
              <ShoppingCart size={19} aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={typography.h2}>Factura {purchase.invoiceNumber}</h2>
                <PurchaseStatusBadge status={purchase.status} />
              </div>
              <p className={`mt-0.5 ${typography.small}`}>
                {purchase.supplierName} · {formatDate(purchase.invoiceDate)}
              </p>
            </div>
          </div>
          {canConfirm && (
            <Button variant="primary" icon={CheckCircle2} onClick={() => setConfirmOpen(true)} disabled={!items?.length}>
              Confirmar compra
            </Button>
          )}
        </div>

        <div className="flex items-end justify-between gap-3 border-t border-neutral-800/60 pt-3">
          <span className={typography.small}>Total de la compra</span>
          <span className="text-2xl font-semibold tabular-nums text-neutral-50">{formatMoney(total)}</span>
        </div>

        {!isDraft && (
          <p className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
            <CheckCircle2 size={15} aria-hidden /> Compra confirmada — inventario actualizado.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {canEditDraft && (
        <Card title="Agregar línea" icon={Plus}>
          <form onSubmit={handleAddItem} className="space-y-3">
            <FormField
              label="Insumo"
              required
              hint={
                lastPrice ? (
                  <Button type="button" variant="link" size="sm" icon={History} onClick={applyLastPrice}>
                    Último: {formatMoney(lastPrice.unitCost)}/{lastPrice.purchaseUnitCode} · {lastPrice.supplierName} · usar
                  </Button>
                ) : undefined
              }
            >
              {() => (
                <Combobox
                  value={ingredientId}
                  onChange={setIngredientId}
                  options={ingredientOptions}
                  placeholder="Nombre o código…"
                  emptyMessage="Sin insumos con ese nombre o código"
                  onCreateNew={(query) => setCreateIngredientQuery(query)}
                  required
                />
              )}
            </FormField>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="Cantidad" required>
                {() => <NumberStepper value={quantity} onChange={setQuantity} min={0} step={1} required />}
              </FormField>
              <FormField label="Unidad de compra" required>
                {(a11y) => (
                  <Select {...a11y} value={purchaseUnitId} onChange={(e) => setPurchaseUnitId(e.target.value)} required>
                    <option value="">Selecciona…</option>
                    {units?.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <FormField label="Costo unitario" required>
                {(a11y) => (
                  <Input {...a11y} type="number" step="any" min="0" inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} required />
                )}
              </FormField>
            </div>
            <Button type="submit" variant="primary" icon={Plus} loading={addItem.isPending}>
              Agregar línea
            </Button>
          </form>
        </Card>
      )}

      <Card title="Líneas" description={`${items?.length ?? 0} insumos en esta factura`} icon={ShoppingCart}>
        {itemsError ? (
          <ErrorState error={itemsErr} onRetry={() => void refetchItems()} compact />
        ) : itemsLoading ? (
          <LoadingState variant="block" className="!border-0 !bg-transparent !p-0" />
        ) : !items || items.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Sin líneas todavía"
            description={isDraft ? 'Agrega el primer insumo con el formulario de arriba.' : 'Esta compra no tiene líneas registradas.'}
            compact
          />
        ) : (
          <ul className="divide-y divide-neutral-800/60">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-100">{item.ingredientName}</p>
                  <p className="text-xs text-neutral-500 tabular-nums">
                    {item.quantity} {item.purchaseUnitCode} × {formatMoney(item.unitCost)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-neutral-100">{formatMoney(item.lineTotal)}</span>
                  {canEditDraft && (
                    <Button
                      variant="link"
                      size="sm"
                      icon={Trash2}
                      className="!text-neutral-400 hover:!text-red-400"
                      onClick={() => deleteItem.mutate(item.id)}
                      aria-label={`Quitar ${item.ingredientName}`}
                    >
                      Quitar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {can('invoices.view') && (
        <Card title="Adjuntos" description="Factura escaneada, fotos u otros comprobantes." icon={Paperclip}>
          <div className="space-y-3">
            {can('invoices.upload') && (
              <div>
                <label htmlFor="purchase-attachment" className="sr-only">
                  Subir adjunto
                </label>
                <input
                  id="purchase-attachment"
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  disabled={uploadAttachment.isPending}
                  className="block w-full text-sm text-neutral-300 file:mr-3 file:rounded-full file:border file:border-neutral-800 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-neutral-200 hover:file:bg-neutral-800 disabled:opacity-50"
                />
                {uploadAttachment.isPending && <LoadingState variant="inline" label="Subiendo…" className="mt-2" />}
              </div>
            )}
            {attachments && attachments.length > 0 ? (
              <ul className="space-y-1">
                {attachments.map((a) => (
                  <li key={a.id}>
                    <Button variant="link" size="sm" icon={Paperclip} onClick={() => void handleOpenAttachment(a.filePath)}>
                      {a.fileName}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={typography.caption}>Todavía no hay adjuntos.</p>
            )}
          </div>
        </Card>
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
            Esto genera movimientos de <strong>entrada de inventario</strong> por cada línea ({formatMoney(total)} en total) y actualiza el costo promedio de los
            insumos. No se puede deshacer — para corregir un error habría que registrar un ajuste manual después.
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
