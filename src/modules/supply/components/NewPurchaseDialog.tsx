import { Button } from '@/shared/ui/Button'
import { Combobox } from '@/shared/ui/Combobox'
import { FormField, Input } from '@/shared/ui/FormField'
import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatMoney, todayStr } from '@/shared/utils/format'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { addPurchaseItem } from '../api/purchases'
import { useCreatePurchase } from '../hooks/usePurchases'
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
 * insumos sugeridos: se crean las líneas con la cantidad sugerida, la unidad
 * base del insumo y su costo promedio como punto de partida — todo editable
 * después en el borrador, que sigue siendo quien decide qué entra al inventario.
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
  const [error, setError] = useState<string | null>(null)
  const [createSupplierQuery, setCreateSupplierQuery] = useState<string | null>(null)
  const [addingLines, setAddingLines] = useState(false)

  const supplierOptions = useMemo(() => suppliers?.map((s) => ({ value: s.id, label: s.name, sublabel: s.phone ?? undefined })) ?? [], [suppliers])
  const lines = presetLines ?? []
  const estimated = lines.reduce((sum, l) => sum + l.quantity * l.ingredient.avgCost, 0)

  function handleSupplierCreated(supplier: Supplier) {
    setCreateSupplierQuery(null)
    setSupplierId(supplier.id)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const purchase = await createPurchase.mutateAsync({ supplierId, invoiceNumber, invoiceDate })
      if (lines.length > 0) {
        setAddingLines(true)
        for (const line of lines) {
          await addPurchaseItem(purchase.id, {
            ingredientId: line.ingredient.id,
            quantity: line.quantity,
            purchaseUnitId: line.ingredient.baseUnitId,
            unitCost: line.ingredient.avgCost,
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
            <Button type="submit" form="new-purchase-form" variant="primary" loading={pending} disabled={!supplierId || !invoiceNumber}>
              Crear borrador
            </Button>
          </>
        }
      >
        <form id="new-purchase-form" onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Proveedor" required>
            {() => (
              <Combobox
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
          <div className="grid grid-cols-2 gap-3">
            <FormField label="N.º de factura" required error={error}>
              {(a11y) => <Input {...a11y} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} required />}
            </FormField>
            <FormField label="Fecha" required>
              {(a11y) => <Input {...a11y} type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />}
            </FormField>
          </div>

          {lines.length > 0 && (
            <div className="rounded-xl border border-neutral-800/60 bg-neutral-950/60 p-3">
              <p className={typography.overline}>Se agregarán {lines.length} línea(s)</p>
              <ul className="mt-2 space-y-1">
                {lines.map((line) => (
                  <li key={line.ingredient.id} className="flex items-center justify-between gap-2 text-xs text-neutral-400">
                    <span className="truncate">{line.ingredient.name}</span>
                    <span className="shrink-0 tabular-nums">
                      {line.quantity} {line.ingredient.baseUnitCode} × {formatMoney(line.ingredient.avgCost)}
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
