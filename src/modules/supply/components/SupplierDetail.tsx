import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { ActiveBadge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { StatCard } from '@/shared/ui/StatCard'
import { useToast } from '@/shared/ui/Toast'
import { cardClass } from '@/shared/ui/formClasses'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate, formatMoney } from '@/shared/utils/format'
import { Boxes, Mail, MapPin, Pencil, Phone, Power, ShoppingCart, Truck, User } from 'lucide-react'
import { useMemo } from 'react'
import { useIngredients } from '../hooks/useIngredients'
import { usePurchases } from '../hooks/usePurchases'
import { useSetSupplierActive } from '../hooks/useSuppliers'
import { PurchaseStatusBadge } from '../lib/purchaseStatus'
import type { Purchase, Supplier } from '../types'

function ContactRow({ icon: Icon, value }: { icon: typeof Phone; value: string | null }) {
  if (!value) return null
  return (
    <p className="flex items-center gap-2 text-sm text-neutral-300">
      <Icon size={13} className="shrink-0 text-neutral-600" aria-hidden /> {value}
    </p>
  )
}

export function SupplierDetail({ supplier, onEdit, onSelectPurchase }: { supplier: Supplier; onEdit: () => void; onSelectPurchase: (purchase: Purchase) => void }) {
  const { can } = useActiveKitchen()
  const { data: purchases } = usePurchases()
  const { data: ingredients } = useIngredients()
  const setActive = useSetSupplierActive()
  const { show } = useToast()

  const supplierPurchases = useMemo(() => (purchases ?? []).filter((p) => p.supplierId === supplier.id), [purchases, supplier.id])
  const supplierIngredients = useMemo(() => (ingredients ?? []).filter((i) => i.primarySupplierId === supplier.id), [ingredients, supplier.id])
  const totalBought = supplierPurchases.filter((p) => p.status === 'CONFIRMADA').reduce((sum, p) => sum + p.total, 0)

  async function handleToggleActive() {
    try {
      await setActive.mutateAsync({ id: supplier.id, active: !supplier.active })
      show(supplier.active ? `"${supplier.name}" desactivado.` : `"${supplier.name}" activado.`)
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo cambiar el estado'), 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className={`${cardClass} space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-brasa-500/20 bg-brasa-500/10 text-brasa-400">
              <Truck size={19} aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={typography.h2}>{supplier.name}</h2>
                <ActiveBadge active={supplier.active} />
              </div>
              {supplier.taxId && <p className={`mt-0.5 ${typography.small}`}>NIT {supplier.taxId}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {can('suppliers.edit') && (
              <>
                <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>
                  Editar
                </Button>
                <Button variant="ghost" size="sm" icon={Power} onClick={() => void handleToggleActive()} loading={setActive.isPending}>
                  {supplier.active ? 'Desactivar' : 'Activar'}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="space-y-1.5 border-t border-neutral-800/60 pt-3">
          <ContactRow icon={Phone} value={supplier.phone} />
          <ContactRow icon={Mail} value={supplier.email} />
          <ContactRow icon={User} value={supplier.contactName} />
          <ContactRow icon={MapPin} value={supplier.address} />
          {!supplier.phone && !supplier.email && !supplier.contactName && !supplier.address && <p className={typography.caption}>Sin datos de contacto cargados.</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard label="Comprado (confirmado)" value={formatMoney(totalBought)} hint={`${supplierPurchases.length} factura(s)`} icon={ShoppingCart} tone="brand" />
        <StatCard label="Insumos asignados" value={supplierIngredients.length} hint="Como proveedor principal" icon={Boxes} />
      </div>

      <Card title="Compras" description="Facturas registradas a este proveedor" icon={ShoppingCart}>
        {supplierPurchases.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="Sin compras" description="Todavía no hay facturas de este proveedor." compact />
        ) : (
          <ul className="divide-y divide-neutral-800/60">
            {supplierPurchases.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelectPurchase(p)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-neutral-800/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-100">Factura {p.invoiceNumber}</p>
                    <p className="text-xs text-neutral-500">{formatDate(p.invoiceDate)}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    <PurchaseStatusBadge status={p.status} />
                    <span className="text-sm font-semibold tabular-nums text-neutral-100">{formatMoney(p.total)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {supplierIngredients.length > 0 && (
        <Card title="Insumos" description="Los que tienen a este proveedor como principal" icon={Boxes}>
          <ul className="divide-y divide-neutral-800/60">
            {supplierIngredients.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="truncate text-sm text-neutral-200">{i.name}</span>
                <span className="shrink-0 text-xs text-neutral-500 tabular-nums">
                  {i.stockAvailable} {i.baseUnitCode}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
