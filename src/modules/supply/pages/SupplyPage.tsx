import { EmptyState } from '@/shared/ui/EmptyState'
import { Page } from '@/shared/ui/Page'
import { PageHeader } from '@/shared/ui/PageHeader'
import { SubNav, type SubNavItem } from '@/shared/ui/SubNav'
import { CookingPot, ShoppingCart, Truck, Warehouse } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useCameFrom } from '@/shared/hooks/useBackTarget'
import { IngredientDetail } from '../components/IngredientDetail'
import { IngredientFormDrawer } from '../components/IngredientFormDrawer'
import { IngredientPanel } from '../components/IngredientPanel'
import { MovementFormDrawer, type MovementMode } from '../components/MovementFormDrawer'
import { NewPreparationDrawer } from '../components/NewPreparationDrawer'
import { PreparationDetail } from '../components/PreparationDetail'
import { PreparationPanel } from '../components/PreparationPanel'
import { NewPurchaseDialog, type PresetLine } from '../components/NewPurchaseDialog'
import { PurchaseDetail } from '../components/PurchaseDetail'
import { PurchasePanel } from '../components/PurchasePanel'
import { ReorderPanel } from '../components/ReorderPanel'
import { StockCountPanel } from '../components/StockCountPanel'
import { SupplierDetail } from '../components/SupplierDetail'
import { SupplierFormDrawer } from '../components/SupplierFormDrawer'
import { SupplierPanel } from '../components/SupplierPanel'
import { useIngredients } from '../hooks/useIngredients'
import { useSuppliers } from '../hooks/useSuppliers'
import { setPendingInvoiceFile } from '../lib/invoiceFile'
import type { Ingredient } from '../types'

type SupplyView = 'stock' | 'preparaciones' | 'compras' | 'proveedores'

/** The physical count lives at /supply/stock/conteo (ADR 0063 D5). */
const STOCK_COUNT_ID = 'conteo'

/** The help center article of each section (ADR 0034). */
const SUPPLY_HELP: Record<SupplyView, string> = { stock: 'stock', preparaciones: 'preparations', compras: 'purchases', proveedores: 'suppliers' }
const VIEWS: SubNavItem<SupplyView>[] = [
  { value: 'stock', label: 'Stock' },
  // ADR 0057: sub-recipes made in batches.
  { value: 'preparaciones', label: 'Preparaciones' },
  { value: 'compras', label: 'Compras' },
  { value: 'proveedores', label: 'Proveedores' },
]

/** Who sees each section: the kitchen (inventory.produce) only sees Preparaciones. */
const VIEW_PERMISSIONS: Record<SupplyView, Parameters<ReturnType<typeof useActiveKitchen>['can']>[0][]> = {
  stock: ['inventory.view'],
  preparaciones: ['inventory.view', 'inventory.produce', 'recipes.view'],
  compras: ['purchasing.view'],
  proveedores: ['suppliers.view'],
}

function isView(value: string | undefined): value is SupplyView {
  return value === 'stock' || value === 'preparaciones' || value === 'compras' || value === 'proveedores'
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
  const { path, can } = useActiveKitchen()
  // ADR 0031: arriving from a recipe (or Insights), «Volver» takes the person back there.
  const cameFrom = useCameFrom()
  const views = VIEWS.filter((v) => VIEW_PERMISSIONS[v.value].some((p) => can(p)))
  const view: SupplyView = isView(viewParam) && views.some((v) => v.value === viewParam) ? viewParam : (views[0]?.value ?? 'stock')
  const selectedId = id ?? null

  const { data: ingredients } = useIngredients()
  const { data: suppliers } = useSuppliers()

  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null)
  const [ingredientDrawerOpen, setIngredientDrawerOpen] = useState(false)
  const [supplierDrawer, setSupplierDrawer] = useState<{ open: boolean; supplierId: string | null }>({ open: false, supplierId: null })
  const [movementDrawer, setMovementDrawer] = useState<{ open: boolean; mode: MovementMode; ingredientId?: string }>({ open: false, mode: 'merma' })
  const [newPreparation, setNewPreparation] = useState(false)
  const [newPurchase, setNewPurchase] = useState<{ open: boolean; supplierId: string | null; lines: PresetLine[] }>({
    open: false,
    supplierId: null,
    lines: [],
  })

  const selectedIngredient = ingredients?.find((i) => i.id === selectedId) ?? null
  const selectedSupplier = suppliers?.find((s) => s.id === selectedId) ?? null

  function go(nextView: SupplyView, nextId?: string) {
    navigate(path(nextId ? `/supply/${nextView}/${nextId}` : `/supply/${nextView}`))
  }

  function openIngredientDrawer(ingredient: Ingredient | null) {
    setEditingIngredient(ingredient)
    setIngredientDrawerOpen(true)
  }

  const panel =
    view === 'stock' ? (
      <IngredientPanel selectedId={selectedId} onSelect={(i) => go('stock', i.id)} onCreate={() => openIngredientDrawer(null)} />
    ) : view === 'preparaciones' ? (
      <PreparationPanel selectedId={selectedId} onSelect={(p) => go('preparaciones', p.id)} onCreate={() => setNewPreparation(true)} />
    ) : view === 'compras' ? (
      <PurchasePanel
        selectedId={selectedId}
        onSelect={(p) => go('compras', p.id)}
        onCreate={() => setNewPurchase({ open: true, supplierId: null, lines: [] })}
        onImport={(file) => {
          setPendingInvoiceFile(file ?? null)
          navigate(path('/supply/compras/importar'))
        }}
      />
    ) : (
      <SupplierPanel selectedId={selectedId} onSelect={(s) => go('proveedores', s.id)} onCreate={() => setSupplierDrawer({ open: true, supplierId: null })} />
    )

  let detail
  if (view === 'stock') {
    // ADR 0063 (D5): /supply/stock/conteo is the physical count.
    detail = selectedId === STOCK_COUNT_ID ? (
      <StockCountPanel onBack={() => go('stock')} />
    ) : selectedIngredient ? (
      <IngredientDetail
        ingredient={selectedIngredient}
        onEdit={() => openIngredientDrawer(selectedIngredient)}
        onRegisterMovement={(mode) => setMovementDrawer({ open: true, mode, ingredientId: selectedIngredient.id })}
      />
    ) : (
      <ReorderPanel
        onSelectIngredient={(ingredientId) => go('stock', ingredientId)}
        onCreatePurchaseFor={(supplierId, lines) => setNewPurchase({ open: true, supplierId, lines })}
        onStartCount={can('inventory.adjust') ? () => go('stock', STOCK_COUNT_ID) : undefined}
      />
    )
  } else if (view === 'preparaciones') {
    detail = selectedId ? (
      <PreparationDetail preparationId={selectedId} />
    ) : (
      <EmptyState
        icon={CookingPot}
        mood={null}
        title="Selecciona una preparación"
        description="Una salsa de la casa o una ensalada base: escribe su receta con lo que rinde, prepárala por lotes y úsala en tus platos sin copiar su costo."
      />
    )
  } else if (view === 'compras') {
    detail = selectedId ? (
      <PurchaseDetail purchaseId={selectedId} />
    ) : (
      <EmptyState
        icon={ShoppingCart}
        mood={null}
        title="Selecciona una compra"
        description="Elige una factura de la lista o crea una nueva: a mano o importándola desde la foto o el PDF de la factura."
      />
    )
  } else {
    detail = selectedSupplier ? (
      <SupplierDetail
        supplier={selectedSupplier}
        onEdit={() => setSupplierDrawer({ open: true, supplierId: selectedSupplier.id })}
        onSelectPurchase={(p) => go('compras', p.id)}
      />
    ) : (
      <EmptyState icon={Truck} mood={null} title="Selecciona un proveedor" description="Elige un proveedor de la lista para ver sus compras e insumos." />
    )
  }

  const supplierForDrawer = supplierDrawer.supplierId ? (suppliers?.find((s) => s.id === supplierDrawer.supplierId) ?? null) : null

  return (
    <Page variant="board">
      <PageHeader
        help={SUPPLY_HELP[view]}
        title="Abastecimiento"
        description="Stock, preparaciones, compras y proveedores en un solo lugar."
        icon={Warehouse}
        backTo={cameFrom?.to}
        backLabel={cameFrom?.label}
      />
      <SubNav label="Secciones de abastecimiento" items={views} value={view} onChange={(next) => go(next)} />

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
        <div className="shrink-0 lg:w-80 xl:w-96">{panel}</div>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{detail}</div>
      </div>

      <IngredientFormDrawer
        key={ingredientDrawerOpen ? `ingredient-${editingIngredient?.id ?? 'new'}` : 'ingredient-closed'}
        ingredient={editingIngredient}
        open={ingredientDrawerOpen}
        onClose={() => setIngredientDrawerOpen(false)}
      />

      <SupplierFormDrawer
        key={supplierDrawer.open ? `supplier-${supplierDrawer.supplierId ?? 'new'}` : 'supplier-closed'}
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

      {newPreparation && (
        <NewPreparationDrawer
          open
          onClose={() => setNewPreparation(false)}
          onCreated={(id) => {
            setNewPreparation(false)
            navigate(path(`/supply/preparaciones/${id}/receta`))
          }}
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
    </Page>
  )
}
