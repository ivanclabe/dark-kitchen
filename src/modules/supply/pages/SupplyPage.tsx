import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { Boxes, ShoppingCart, Truck, Warehouse } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IngredientDetail } from '../components/IngredientDetail'
import { IngredientFormDrawer } from '../components/IngredientFormDrawer'
import { IngredientPanel } from '../components/IngredientPanel'
import { MovementFormDrawer, type MovementMode } from '../components/MovementFormDrawer'
import { NewPurchaseDialog, type PresetLine } from '../components/NewPurchaseDialog'
import { PurchaseDetail } from '../components/PurchaseDetail'
import { PurchasePanel } from '../components/PurchasePanel'
import { ReorderPanel } from '../components/ReorderPanel'
import { SupplierDetail } from '../components/SupplierDetail'
import { SupplierFormDrawer } from '../components/SupplierFormDrawer'
import { SupplierPanel } from '../components/SupplierPanel'
import { useIngredients } from '../hooks/useIngredients'
import { useSuppliers } from '../hooks/useSuppliers'
import type { Ingredient } from '../types'

type SupplyView = 'stock' | 'compras' | 'proveedores'

const VIEWS: TabItem<SupplyView>[] = [
  { value: 'stock', label: 'Stock', icon: Boxes },
  { value: 'compras', label: 'Compras', icon: ShoppingCart },
  { value: 'proveedores', label: 'Proveedores', icon: Truck },
]

function isView(value: string | undefined): value is SupplyView {
  return value === 'stock' || value === 'compras' || value === 'proveedores'
}

/**
 * Abastecimiento en una sola experiencia: Stock · Compras · Proveedores, cada
 * una con panel lateral (lista buscable) + detalle, igual que el Planificador
 * de Menús. La vista y el elemento seleccionado viven en la URL
 * (/supply/:view/:id) para que el enlace directo y el botón atrás funcionen.
 * Toda la lógica de datos es la que ya existía en inventory/purchases/suppliers.
 */
export function SupplyPage() {
  const { view: viewParam, id } = useParams<{ view?: string; id?: string }>()
  const navigate = useNavigate()
  const view: SupplyView = isView(viewParam) ? viewParam : 'stock'
  const selectedId = id ?? null

  const { data: ingredients } = useIngredients()
  const { data: suppliers } = useSuppliers()

  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null)
  const [ingredientDrawerOpen, setIngredientDrawerOpen] = useState(false)
  const [supplierDrawer, setSupplierDrawer] = useState<{ open: boolean; supplierId: string | null }>({ open: false, supplierId: null })
  const [movementDrawer, setMovementDrawer] = useState<{ open: boolean; mode: MovementMode; ingredientId?: string }>({ open: false, mode: 'merma' })
  const [newPurchase, setNewPurchase] = useState<{ open: boolean; supplierId: string | null; lines: PresetLine[] }>({
    open: false,
    supplierId: null,
    lines: [],
  })

  const selectedIngredient = ingredients?.find((i) => i.id === selectedId) ?? null
  const selectedSupplier = suppliers?.find((s) => s.id === selectedId) ?? null

  function go(nextView: SupplyView, nextId?: string) {
    navigate(nextId ? `/supply/${nextView}/${nextId}` : `/supply/${nextView}`)
  }

  function openIngredientDrawer(ingredient: Ingredient | null) {
    setEditingIngredient(ingredient)
    setIngredientDrawerOpen(true)
  }

  const panel =
    view === 'stock' ? (
      <IngredientPanel selectedId={selectedId} onSelect={(i) => go('stock', i.id)} onCreate={() => openIngredientDrawer(null)} />
    ) : view === 'compras' ? (
      <PurchasePanel
        selectedId={selectedId}
        onSelect={(p) => go('compras', p.id)}
        onCreate={() => setNewPurchase({ open: true, supplierId: null, lines: [] })}
      />
    ) : (
      <SupplierPanel selectedId={selectedId} onSelect={(s) => go('proveedores', s.id)} onCreate={() => setSupplierDrawer({ open: true, supplierId: null })} />
    )

  let detail
  if (view === 'stock') {
    detail = selectedIngredient ? (
      <IngredientDetail
        ingredient={selectedIngredient}
        onEdit={() => openIngredientDrawer(selectedIngredient)}
        onRegisterMovement={(mode) => setMovementDrawer({ open: true, mode, ingredientId: selectedIngredient.id })}
      />
    ) : (
      <ReorderPanel onSelectIngredient={(ingredientId) => go('stock', ingredientId)} onCreatePurchaseFor={(supplierId, lines) => setNewPurchase({ open: true, supplierId, lines })} />
    )
  } else if (view === 'compras') {
    detail = selectedId ? (
      <PurchaseDetail purchaseId={selectedId} />
    ) : (
      <EmptyState icon={ShoppingCart} title="Selecciona una compra" description="Elige una factura de la lista o crea un borrador nuevo." />
    )
  } else {
    detail = selectedSupplier ? (
      <SupplierDetail
        supplier={selectedSupplier}
        onEdit={() => setSupplierDrawer({ open: true, supplierId: selectedSupplier.id })}
        onSelectPurchase={(p) => go('compras', p.id)}
      />
    ) : (
      <EmptyState icon={Truck} title="Selecciona un proveedor" description="Elige un proveedor de la lista para ver sus compras e insumos." />
    )
  }

  const supplierForDrawer = supplierDrawer.supplierId ? (suppliers?.find((s) => s.id === supplierDrawer.supplierId) ?? null) : null

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="Abastecimiento"
        description="Stock, compras y proveedores en un solo lugar."
        icon={Warehouse}
        actions={<Tabs value={view} onChange={(next) => go(next)} items={VIEWS} />}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
        <div className="shrink-0 lg:w-80 xl:w-96">{panel}</div>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{detail}</div>
      </div>

      <IngredientFormDrawer
        key={ingredientDrawerOpen ? (editingIngredient?.id ?? 'new') : 'closed'}
        ingredient={editingIngredient}
        open={ingredientDrawerOpen}
        onClose={() => setIngredientDrawerOpen(false)}
      />

      <SupplierFormDrawer
        key={supplierDrawer.open ? (supplierDrawer.supplierId ?? 'new') : 'closed'}
        supplier={supplierForDrawer}
        open={supplierDrawer.open}
        onClose={() => setSupplierDrawer({ open: false, supplierId: null })}
      />

      {movementDrawer.open && (
        <MovementFormDrawer
          open
          mode={movementDrawer.mode}
          ingredientId={movementDrawer.ingredientId}
          onClose={() => setMovementDrawer({ open: false, mode: movementDrawer.mode })}
        />
      )}

      {newPurchase.open && (
        <NewPurchaseDialog
          open
          presetSupplierId={newPurchase.supplierId}
          presetLines={newPurchase.lines}
          onClose={() => setNewPurchase({ open: false, supplierId: null, lines: [] })}
          onCreated={(purchaseId) => go('compras', purchaseId)}
        />
      )}
    </div>
  )
}
