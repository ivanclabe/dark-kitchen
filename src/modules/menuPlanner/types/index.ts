/**
 * Una fila = un plato asignado a una fecha concreta del calendario, con sus
 * reglas de disponibilidad propias (nunca reglas separadas por tabla — ver
 * dk_menu_plan_items). Reemplaza Menús/Menú del día/Menú semanal.
 */
export interface MenuPlanItem {
  id: string
  planDate: string
  productId: string
  productName: string
  productPrice: number
  productCategory: string | null
  productActive: boolean
  displayOrder: number
  isActive: boolean
  startTime: string | null
  endTime: string | null
  specialPrice: number | null
  unitLimit: number | null
  whileSuppliesLast: boolean
}

export interface MenuPlanItemRules {
  isActive: boolean
  startTime: string | null
  endTime: string | null
  specialPrice: number | null
  unitLimit: number | null
  whileSuppliesLast: boolean
}

export interface AddMenuPlanItemInput extends Partial<MenuPlanItemRules> {
  productId: string
  displayOrder?: number
}
