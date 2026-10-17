import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { CurrencyInput } from '@/shared/ui/CurrencyInput'
import { setIngredientPackage } from '@/shared/api/units'
import { INGREDIENT_PACKAGES_KEY, useIngredientUnits } from '@/shared/hooks/useIngredientUnits'
import { formatNumber, PACKAGING_UNITS, unitFactor } from '@/shared/units/conversion'
import { NumberInput } from '@/shared/ui/NumberInput'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Combobox } from '@/shared/ui/Combobox'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { FormField, Input, Select } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Modal } from '@/shared/ui/Modal'
import { Badge } from '@/shared/ui/Badge'
import { PayObligationModal } from '@/modules/finance/components/FinanceDialogs'
import { PurchasePaymentChoice } from '@/modules/finance/components/PurchasePaymentChoice'
import { usePurchaseObligation } from '@/modules/finance/hooks'
import { STATUS_LABEL, STATUS_TONE } from '@/modules/finance/lib/finance'
import type { PurchasePayment } from '@/modules/finance/types'
import { addDays } from '@/modules/insights/lib/periods'
import { useSuppliers } from '../hooks/useSuppliers'
import { useToast } from '@/shared/ui/Toast'
import { cardClass } from '@/shared/ui/formClasses'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate, formatMoney } from '@/shared/utils/format'
import { AlertTriangle, CheckCircle2, HandCoins, History, Paperclip, Pencil, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { CreateIngredientModal } from './CreateIngredientModal'
import { useIngredients } from '../hooks/useIngredients'
import {
  useAddPurchaseItem,
  useAttachmentUrl,
  useAttachments,
  useConfirmPurchase,
  useDeletePurchaseItem,
  usePriceReferences,
  usePurchase,
  usePurchaseItems,
  useUpdatePurchaseHeader,
  useUploadAttachment,
} from '../hooks/usePurchases'
import { useCostSettings } from '@/shared/costs/costSettings'
import { priceChanges, priceChangeText } from '@/shared/costs/priceChange'
import type { PriceReference } from '../types'
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
  // ADR 0056: only the units that convert for the chosen ingredient, and its packages.
  const { units, infoFor } = useIngredientUnits()
  const queryClient = useQueryClient()

  const addItem = useAddPurchaseItem(purchaseId)
  const deleteItem = useDeletePurchaseItem(purchaseId)
  const confirmPurchase = useConfirmPurchase(purchaseId)
  const uploadAttachment = useUploadAttachment(purchaseId)
  const updateHeader = useUpdatePurchaseHeader(purchaseId)
  const cost = useCostSettings()
  const attachmentUrl = useAttachmentUrl()

  const [ingredientId, setIngredientId] = useState('')
  const [quantity, setQuantity] = useState(0)
  const [purchaseUnitId, setPurchaseUnitId] = useState('')
  const [unitCost, setUnitCost] = useState<number | null>(null)
  const [packFactor, setPackFactor] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // ADR 0051 (D3): how it was paid, asked when confirming.
  const [payment, setPayment] = useState<PurchasePayment>({ mode: 'cash', method: 'Efectivo' })
  const [paying, setPaying] = useState(false)
  const { data: suppliers } = useSuppliers()
  const { data: obligation } = usePurchaseObligation(purchaseId, can('finance.view') && purchase?.status === 'CONFIRMADA')
  const [createIngredientQuery, setCreateIngredientQuery] = useState<string | null>(null)
  // ADR 0063 (D4): the draft header is editable; the invoice number can wait until confirming.
  const [headerOpen, setHeaderOpen] = useState(false)
  const [header, setHeader] = useState<{ invoiceNumber: string; invoiceDate: string; taxPct: number | null }>({ invoiceNumber: '', invoiceDate: '', taxPct: null })
  const [confirmInvoiceNumber, setConfirmInvoiceNumber] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ADR 0063 (D4): one call for the price references of the lines and of the ingredient being added.
  const { data: references } = usePriceReferences([ingredientId, ...(items?.map((i) => i.ingredientId) ?? [])])
  const lastPrice = ingredientId ? (references?.[ingredientId]?.last ?? null) : null
  const tolerance = cost.enabled ? cost.priceChangePct : 0

  const isDraft = purchase?.status === 'BORRADOR'
  // Borradores: los edita quien crea compras; confirmar (entra al inventario) es un permiso aparte.
  const canEditDraft = isDraft && can('purchasing.create')
  const canConfirm = isDraft && can('purchasing.confirm')
  const subtotal = items?.reduce((sum, item) => sum + item.lineTotal, 0) ?? 0
  // A draft shows the tax it will have on confirm; a confirmed one, what was recorded.
  const tax = !purchase ? 0 : !isDraft ? purchase.tax : purchase.taxPct !== null ? Math.round(subtotal * purchase.taxPct) / 100 : purchase.tax
  const total = !purchase || isDraft ? subtotal + tax : purchase.total

  const ingredientOptions = useMemo(() => ingredients?.filter((i) => !i.isPreparation).map((i) => ({ value: i.id, label: i.name, sublabel: i.code })) ?? [], [ingredients])
  const ingredient = ingredients?.find((i) => i.id === ingredientId)
  const info = infoFor(ingredient)
  // What can be bought: the units that convert, plus generic packages (it asks how much one brings).
  const unitChoices = info ? units.filter((u) => u.code !== 'porcion' && (unitFactor(u.code, info, units) !== null || PACKAGING_UNITS.includes(u.code))) : []
  const chosenUnit = units.find((u) => u.id === purchaseUnitId) ?? null
  const knownFactor = chosenUnit ? unitFactor(chosenUnit.code, info, units) : null
  const needsPack = Boolean(chosenUnit && knownFactor === null && PACKAGING_UNITS.includes(chosenUnit.code))
  const factor = knownFactor ?? (needsPack && packFactor ? packFactor : null)
  const equivalenceText =
    ingredient && chosenUnit && factor && chosenUnit.code !== ingredient.baseUnitCode && quantity > 0
      ? `${formatNumber(quantity)} ${chosenUnit.code} = ${formatNumber(quantity * factor)} ${ingredient.baseUnitCode}${unitCost ? ` · ${formatMoney(unitCost / factor, { decimals: 'auto' })}/${ingredient.baseUnitCode}` : ''}`
      : null

  const newLineWarnings = ingredient && factor && unitCost ? priceWarnings(unitCost / factor, references?.[ingredient.id], tolerance) : []

  function chooseIngredient(id: string) {
    setIngredientId(id)
    setPackFactor(null)
    const base = units.find((u) => u.code === ingredients?.find((i) => i.id === id)?.baseUnitCode)
    setPurchaseUnitId(base?.id ?? '')
  }

  function applyLastPrice() {
    if (!lastPrice) return
    setUnitCost(lastPrice.unitCost)
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
      // A new package («caja de 12») is remembered for this ingredient before the line is added.
      if (needsPack) {
        if (!packFactor || packFactor <= 0) {
          setError(`Indica cuántos ${ingredient?.baseUnitCode ?? ''} trae 1 ${chosenUnit?.code ?? ''}`)
          return
        }
        await setIngredientPackage(ingredientId, purchaseUnitId, packFactor)
        await queryClient.invalidateQueries({ queryKey: INGREDIENT_PACKAGES_KEY })
      }
      await addItem.mutateAsync({ ingredientId, quantity, purchaseUnitId, unitCost: unitCost ?? 0 })
      setIngredientId('')
      setQuantity(0)
      setPurchaseUnitId('')
      setUnitCost(null)
      setPackFactor(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Error al agregar la línea'))
    }
  }

  function openHeader() {
    if (!purchase) return
    setHeader({ invoiceNumber: purchase.invoiceNumber ?? '', invoiceDate: purchase.invoiceDate, taxPct: purchase.taxPct })
    setHeaderOpen(true)
  }

  async function handleSaveHeader(e: FormEvent) {
    e.preventDefault()
    try {
      await updateHeader.mutateAsync({ invoiceNumber: header.invoiceNumber || null, invoiceDate: header.invoiceDate, taxPct: header.taxPct })
      setHeaderOpen(false)
      show('Datos de la factura actualizados.')
    } catch (err) {
      show(getErrorMessage(err, 'No se pudieron guardar los datos de la factura'), 'error')
    }
  }

  async function handleConfirm() {
    setError(null)
    try {
      // The invoice number is required to confirm: asked here when the draft has none.
      if (!purchase?.invoiceNumber) {
        if (!confirmInvoiceNumber.trim()) {
          setError('Escribe el número de la factura antes de confirmar la compra')
          return
        }
        await updateHeader.mutateAsync({ invoiceNumber: confirmInvoiceNumber, invoiceDate: purchase!.invoiceDate, taxPct: purchase!.taxPct })
      }
      await confirmPurchase.mutateAsync(payment)
      setConfirmOpen(false)
      show(payment.mode === 'cash' ? 'Compra confirmada y pagada — inventario actualizado.' : 'Compra confirmada — inventario actualizado; quedó en Por pagar.')
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
    // Safari blocks a window opened after an await (it is no longer the tap): the tab opens now, the file arrives after.
    const tab = window.open('', '_blank')
    try {
      const url = await attachmentUrl.mutateAsync(filePath)
      if (tab) {
        tab.opener = null
        tab.location.href = url
      } else {
        window.location.assign(url)
      }
    } catch (err) {
      tab?.close()
      setError(getErrorMessage(err, 'No se pudo abrir el adjunto'))
    }
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
                <h2 className={typography.h2}>{purchase.invoiceNumber ? `Factura ${purchase.invoiceNumber}` : 'Compra sin n.º de factura'}</h2>
                <PurchaseStatusBadge status={purchase.status} />
              </div>
              <p className={`mt-0.5 flex flex-wrap items-center gap-x-2 ${typography.small}`}>
                <span>
                  {purchase.supplierName} · {formatDate(purchase.invoiceDate)}
                  {purchase.taxPct !== null ? ` · IVA ${formatNumber(purchase.taxPct)} %` : ''}
                </span>
                {canEditDraft && (
                  <Button variant="link" size="sm" icon={Pencil} onClick={openHeader}>
                    Editar datos
                  </Button>
                )}
              </p>
            </div>
          </div>
          {canConfirm && (
            <Button
              variant="primary"
              icon={CheckCircle2}
              onClick={() => {
                // A supplier with a payment term proposes «a crédito», due on the invoice date plus the term.
                const terms = suppliers?.find((s) => s.id === purchase.supplierId)?.paymentTermsDays ?? 0
                setPayment(terms > 0 ? { mode: 'credit', dueDate: addDays(purchase.invoiceDate, terms) } : { mode: 'cash', method: 'Efectivo' })
                setConfirmInvoiceNumber('')
                setError(null)
                setConfirmOpen(true)
              }}
              disabled={!items?.length}
            >
              Confirmar compra
            </Button>
          )}
        </div>

        <div className="flex items-end justify-between gap-3 border-t border-neutral-800/60 pt-3">
          <span className={typography.small}>
            Total de la compra
            {tax > 0 && (
              <span className="block text-xs text-neutral-500 tabular-nums">
                Subtotal {formatMoney(subtotal)} · IVA {formatMoney(tax)}
                {isDraft && purchase.taxPct !== null ? ' (se calcula al confirmar)' : ''}
              </span>
            )}
          </span>
          <span className="text-2xl font-semibold tabular-nums text-neutral-50">{formatMoney(total, { code: true })}</span>
        </div>

        {!isDraft && (
          <p className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
            <CheckCircle2 size={15} aria-hidden /> Compra confirmada — inventario actualizado.
          </p>
        )}
        {/* ADR 0051: what is owed for this purchase (one obligation per purchase). */}
        {obligation && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800/60 bg-neutral-900/40 px-3 py-2.5 text-sm">
            <span className="flex flex-wrap items-center gap-2 text-neutral-300">
              Pago al proveedor <Badge tone={STATUS_TONE[obligation.status]}>{STATUS_LABEL[obligation.status]}</Badge>
              {obligation.balance > 0 && (
                <span className="text-neutral-400">
                  debe {formatMoney(obligation.balance)} · vence el {formatDate(obligation.dueDate)}
                </span>
              )}
            </span>
            {obligation.balance > 0 && can('finance.pay') && (
              <Button variant="secondary" size="sm" icon={HandCoins} onClick={() => setPaying(true)}>
                Registrar pago
              </Button>
            )}
          </div>
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
                    Último: {formatMoney(lastPrice.unitCost, { decimals: 'auto' })}/{lastPrice.purchaseUnitCode} · {lastPrice.supplierName} · {formatDate(lastPrice.invoiceDate)} · usar
                  </Button>
                ) : undefined
              }
            >
              {(a11y) => (
                <Combobox
                  {...a11y}
                  value={ingredientId}
                  onChange={chooseIngredient}
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
                {(a11y) => <NumberInput {...a11y} value={quantity || null} onValueChange={(v) => setQuantity(v ?? 0)} decimals={3} min={0} required />}
              </FormField>
              <FormField label="Unidad de compra" required info="Compra en la unidad de la factura (kg, l, caja…): Quanela la convierte a la unidad del inventario al confirmar.">
                {(a11y) => (
                  <Select
                    {...a11y}
                    value={purchaseUnitId}
                    onChange={(e) => {
                      setPurchaseUnitId(e.target.value)
                      setPackFactor(null)
                    }}
                    required
                    disabled={!ingredient}
                  >
                    <option value="">{ingredient ? 'Selecciona…' : 'Elige el insumo'}</option>
                    {unitChoices.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                        {u.code === ingredient?.baseUnitCode ? ' (inventario)' : ''}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <FormField label="Costo unitario" required info="Lo que pagaste por cada unidad de compra, según la factura. Al confirmar la compra, recalcula el costo promedio del insumo.">
                {(a11y) => <CurrencyInput {...a11y} value={unitCost} onValueChange={setUnitCost} decimals={2} required />}
              </FormField>
            </div>
            {needsPack && ingredient && chosenUnit && (
              <FormField
                label={`¿Cuántos ${ingredient.baseUnitCode} trae 1 ${chosenUnit.code}?`}
                required
                hint="Se recuerda para este insumo: la próxima vez no lo vuelve a preguntar."
              >
                {(a11y) => <NumberInput {...a11y} value={packFactor} onValueChange={setPackFactor} decimals={3} min={0} unit={ingredient.baseUnitCode} required />}
              </FormField>
            )}
            {equivalenceText && (
              <p className="text-xs text-neutral-400 tabular-nums" aria-live="polite">
                Entra al inventario: {equivalenceText}
              </p>
            )}
            {newLineWarnings.length > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-amber-400" aria-live="polite">
                <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden />
                {newLineWarnings.join(' · ')} — revisa el costo antes de agregar.
              </p>
            )}
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
                    {formatNumber(item.quantity)} {item.purchaseUnitCode} × {formatMoney(item.unitCost, { decimals: 'auto' })}
                    {(() => {
                      const base = ingredients?.find((i) => i.id === item.ingredientId)
                      const f = base && item.purchaseUnitCode !== base.baseUnitCode ? unitFactor(item.purchaseUnitCode, infoFor(base), units) : null
                      return f ? ` → ${formatNumber(item.quantity * f)} ${base!.baseUnitCode}` : ''
                    })()}
                  </p>
                  {isDraft &&
                    (() => {
                      // ADR 0063 (D4): the price of the line against the last purchase and the 90-day average.
                      const base = ingredients?.find((i) => i.id === item.ingredientId)
                      const f = base ? (item.purchaseUnitCode === base.baseUnitCode ? 1 : unitFactor(item.purchaseUnitCode, infoFor(base), units)) : null
                      const warnings = f && item.unitCost > 0 ? priceWarnings(item.unitCost / f, references?.[item.ingredientId], tolerance) : []
                      return warnings.length > 0 ? (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-400">
                          <AlertTriangle size={12} className="shrink-0" aria-hidden />
                          {warnings.join(' · ')}
                        </p>
                      ) : null
                    })()}
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

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirmar compra"
        description={`${formatMoney(total, { code: true })} de ${purchase.supplierName}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={confirmPurchase.isPending}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void handleConfirm()} loading={confirmPurchase.isPending}>
              Sí, confirmar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {!purchase.invoiceNumber && (
            <FormField label="N.º de factura" required hint="Se necesita para confirmar." error={error}>
              {(a11y) => <Input {...a11y} value={confirmInvoiceNumber} onChange={(e) => setConfirmInvoiceNumber(e.target.value)} autoFocus />}
            </FormField>
          )}
          <p className="text-sm text-neutral-300">
            Esto genera movimientos de <strong>entrada de inventario</strong> por cada línea y actualiza el costo promedio de los insumos. No se puede deshacer — para
            corregir un error habría que registrar un ajuste manual después.
          </p>
          <PurchasePaymentChoice value={payment} onChange={setPayment} />
        </div>
      </Modal>
      <Modal
        open={headerOpen}
        onClose={() => setHeaderOpen(false)}
        title="Datos de la factura"
        description="Solo se pueden cambiar mientras la compra es borrador."
        footer={
          <>
            <Button variant="ghost" onClick={() => setHeaderOpen(false)} disabled={updateHeader.isPending}>
              Cancelar
            </Button>
            <Button type="submit" form="purchase-header-form" variant="primary" loading={updateHeader.isPending} disabled={!header.invoiceDate}>
              Guardar
            </Button>
          </>
        }
      >
        <form id="purchase-header-form" onSubmit={handleSaveHeader} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <FormField label="N.º de factura" hint="Se pide al confirmar.">
            {(a11y) => <Input {...a11y} value={header.invoiceNumber} onChange={(e) => setHeader((h) => ({ ...h, invoiceNumber: e.target.value }))} />}
          </FormField>
          <FormField label="Fecha" required>
            {(a11y) => <Input {...a11y} type="date" value={header.invoiceDate} onChange={(e) => setHeader((h) => ({ ...h, invoiceDate: e.target.value }))} required />}
          </FormField>
          <FormField label="IVA" info="Al confirmar, el IVA se calcula sobre el subtotal. Vacío = el IVA que ya tiene la compra.">
            {(a11y) => <NumberInput {...a11y} value={header.taxPct} onValueChange={(v) => setHeader((h) => ({ ...h, taxPct: v ?? null }))} min={0} max={100} decimals={2} unit="%" />}
          </FormField>
        </form>
      </Modal>
      {paying && obligation && <PayObligationModal obligation={obligation} onClose={() => setPaying(false)} />}

      <CreateIngredientModal
        open={createIngredientQuery !== null}
        onClose={() => setCreateIngredientQuery(null)}
        initialQuery={createIngredientQuery ?? ''}
        onCreated={handleIngredientCreated}
      />
    </div>
  )
}

/** The price warnings of a cost per base unit (ADR 0063 D4); none without references or with the rules off. */
function priceWarnings(perBase: number, ref: PriceReference | undefined, tolerancePct: number): string[] {
  if (!ref) return []
  return priceChanges(perBase, { lastPerBase: ref.last?.perBase ?? null, avg90PerBase: ref.avg90PerBase, avgCost: ref.avgCost }, tolerancePct).map(priceChangeText)
}
