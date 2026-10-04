import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useSearchParams } from 'react-router-dom'
import { MenuPlannerPage } from './MenuPlannerPage'
import { SharedDishesPage } from './SharedDishesPage'

/** Catálogo: the menu planner, or the shared dishes (?view=shared) for whoever manages them (ADR 0024, D4). */
export function CatalogPage() {
  const { canShared } = useActiveKitchen()
  const [params] = useSearchParams()
  if (params.get('view') === 'shared' && canShared('master_menus.manage')) return <SharedDishesPage />
  return <MenuPlannerPage />
}
