import { MasterMenusPanel } from '@/modules/platform/components/MasterMenusPanel'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { KitchenLink as Link } from '@/shared/kitchen/KitchenLink'
import { buttonClass } from '@/shared/ui/Button'
import { PageHeader } from '@/shared/ui/PageHeader'
import { ArrowLeft, Layers } from 'lucide-react'

/**
 * Catálogo → Platos compartidos (ADR 0024, D4): the menus with recipe that
 * you keep in one place (they were the organization's "menús maestros"),
 * seen from this account.
 */
export function SharedDishesPage() {
  const { kitchen } = useActiveKitchen()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Platos compartidos"
        icon={Layers}
        description="Menús con receta que mantienes en un solo lugar y puedes usar en tus cuentas."
        actions={
          <Link to="/menu-planner" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
            <ArrowLeft size={14} aria-hidden /> Planificador
          </Link>
        }
      />
      <MasterMenusPanel organizationId={kitchen.organizationId} account={{ id: kitchen.id, name: kitchen.name }} />
    </div>
  )
}
