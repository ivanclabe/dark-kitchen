import { Button } from '@/shared/ui/Button'
import { Combobox } from '@/shared/ui/Combobox'
import { FormField, Input } from '@/shared/ui/FormField'
import { NumberInput } from '@/shared/ui/NumberInput'
import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatMoney, todayStr } from '@/shared/utils/format'
import { useQueryClient } from '@tanstack/react-query'
import { formatNumber, PACKAGING_UNITS } from '@/shared/units/conversion'
import { useMemo, useState, type FormEvent } from 'react'
import { addPurchaseItem } from '../api/purchases'
import { useCreatePurchase, usePriceReferences } from '../hooks/usePurchases'
import { useSuppliers } from '../hooks/useSuppliers'
import type { Ingredient, Supplier } from '../types'
import { CreateSupplierModal } from './CreateSupplierModal'

/** Línea precargada desde "Reponer": el insumo y cuánto pedir (lo decide quien abre el diálogo). */
export interface PresetLine {
  ingredient: Ingredient
  quantity: number
}

/**
 * Crear borrador de compra. Si viene de "Reponer" trae el proveedor y los
 * insumos sugeridos: se crean las líneas con la cantidad sugerida y, como punto
 * de partida, la unidad y el precio de la última compra (ADR 0063 D4; sin
 * compras previas, la unidad base y el costo promedio) — todo editable después
 * en el borrador, que sigue siendo quien decide qué entra al inventario.
 * El número de factura es opcional hasta confirmar; el IVA se propone del proveedor.
 */
export function NewPurchaseDialog({
  open,
  onClose,
  onCreated,
  presetSupplierId,
  presetLines,
}: {
  open: boolean
  onClose: () => void
  onCreated: (purchaseId: string) => void
  presetSupplierId?: string | null
  presetLines?: PresetLine[]
}) {
  const { data: suppliers } = useSuppliers()
  const createPurchase = useCreatePurchase()
  const queryClient = useQueryClient()
  const { show } = useToast()

  const [supplierId, setSupplierId] = useState(presetSupplierId ?? '')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(() => todayStr())
  // null = untouched: the supplier's usual VAT is proposed.
  const [taxPct, setTaxPct] = useState<number | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [createSupplierQuery, setCreateSupplierQuery] = useState<string | null>(null)
  const [addingLines, setAddingLines] = useState(false)

  const supplierOptions = useMemo(() => suppliers?.map((s) => ({ value: s.id, label: s.name, sublabel: s.phone ?? undefined })) ?? [], [suppliers])
  const lines = presetLines ?? []
  const { data: references } = usePriceReferences(lines.map((l) => l.ingredient.id))
  // Last purchase unit and price when there is one; otherwise the base unit at the average cost.
  const planned = lines.map((line) => {
    const last = references?.[line.ingredient.id]?.last
    return last && last.perBase > 0
      ? { line, unitId: last.purchaseUnitId, unitCode: last.purchaseUnitCode, quantity: inPurchaseUnit(line.quantity, last.unitCost / last.perBase, last.purchaseUnitCode), unitCost: last.unitCost }
      : { line, unitId: line.ingredient.baseUnitId, unitCode: line.ingredient.baseUnitCode, quantity: line.quantity, unitCost: line.ingredient.avgCost }
  })
  const estimated = planned.reduce((sum, p) => sum + p.quantity * p.unitCost, 0)
  const supplierVat = suppliers?.find((s) => s.id === supplierId)?.defaultVatPct ?? null
  const effectiveTaxPct = taxPct === undefined ? supplierVat : taxPct

  function handleSupplierCreated(supplier: Supplier) {
    setCreateSupplierQuery(null)
    setSupplierId(supplier.id)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const purchase = await createPurchase.mutateAsync({ supplierId, invoiceNumber: invoiceNumber || null, invoiceDate, taxPct: effectiveTaxPct })
      if (planned.length > 0) {
        setAddingLines(true)
        for (const p of planned) {
          await addPurchaseItem(purchase.id, {
            ingredientId: p.line.ingredient.id,
            quantity: p.quantity,
            purchaseUnitId: p.unitId,
            unitCost: p.unitCost,
          })
        }
        await queryClient.invalidateQueries({ queryKey: ['purchase-items', purchase.id] })
        show(`Borrador creado con ${lines.length} línea(s).`)
      } else {
        show('Borrador creado.')
      }
      onCreated(purchase.id)
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'Error al crear la compra'))
    } finally {
      setAddingLines(false)
    }
  }

  const pending = createPurchase.isPending || addingLines

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Nueva compra"
        description="Se crea como borrador: las líneas no tocan el inventario hasta que la confirmes."
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" form="new-purchase-form" variant="primary" loading={pending} disabled={!supplierId}>
              Crear borrador
            </Button>
          </>
        }
      >
        <form id="new-purchase-form" onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Proveedor" required>
            {(a11y) => (
              <Combobox
                {...a11y}
                value={supplierId}
                onChange={setSupplierId}
                options={supplierOptions}
                placeholder="Buscar proveedor…"
                emptyMessage="Sin proveedores con ese nombre"
                onCreateNew={(query) => setCreateSupplierQuery(query)}
                required
              />
            )}
          </FormField>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <FormField label="N.º de factura" hint="Puedes escribirlo después; se pide al confirmar." error={error}>
              {(a11y) => <Input {...a11y} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />}
            </FormField>
            <FormField label="Fecha" required>
              {(a11y) => <Input {...a11y} type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />}
            </FormField>
            <FormField label="IVA" info="Al confirmar, el IVA se calcula sobre el subtotal. Vacío = sin IVA.">
              {(a11y) => <NumberInput {...a11y} value={effectiveTaxPct} onValueChange={(v) => setTaxPct(v ?? null)} min={0} max={100} decimals={2} unit="%" />}
            </FormField>
          </div>

          {lines.length > 0 && (
            <div className="rounded-xl border border-neutral-800/60 bg-neutral-950/60 p-3">
              <p className={typography.overline}>Se agregarán {lines.length} línea(s)</p>
              <ul className="mt-2 space-y-1">
                {planned.map((p) => (
                  <li key={p.line.ingredient.id} className="flex items-center justify-between gap-2 text-xs text-neutral-400">
                    <span className="truncate">{p.line.ingredient.name}</span>
                    <span className="shrink-0 tabular-nums">
                      {formatNumber(p.quantity)} {p.unitCode} × {formatMoney(p.unitCost, { decimals: 'auto' })}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-right text-xs text-neutral-500">
                Estimado: <span className="font-semibold tabular-nums text-neutral-300">{formatMoney(estimated)}</span>
              </p>
            </div>
          )}
        </form>
      </Modal>

      <CreateSupplierModal
        open={createSupplierQuery !== null}
        onClose={() => setCreateSupplierQuery(null)}
        initialQuery={createSupplierQuery ?? ''}
        onCreated={handleSupplierCreated}
      />
    </>
  )
}

/** The suggested base quantity in the purchase unit: whole packages (a box is not split), otherwise 3 decimals. */
function inPurchaseUnit(baseQty: number, factor: number, unitCode: string): number {
  const qty = baseQty / factor
  return PACKAGING_UNITS.includes(unitCode) ? Math.max(1, Math.ceil(qty - 1e-9)) : Math.round(qty * 1000) / 1000
}
