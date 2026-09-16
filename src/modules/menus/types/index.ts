export interface Menu {
  id: string
  name: string
  description: string | null
  active: boolean
}

export interface MenuItem {
  id: string
  menuId: string
  productId: string
  productName: string
  productPrice: number
  active: boolean
  specialPrice: number | null
  startTime: string | null
  endTime: string | null
}

export interface MenuItemInput {
  productId: string
  specialPrice?: number | null
  startTime?: string | null
  endTime?: string | null
}

export interface TodayMenuItem extends MenuItem {
  menuName: string
  effectiveAvailable: boolean
  effectivePrice: number
  dailyOverrideId: string | null
}

// --- Menú semanal (recurrente por día, fuente de verdad para n8n/WhatsApp) ---
// Eje independiente del sistema de Menú/Menú del día de arriba — ver
// docs/audit/menu-semanal-n8n-integration-audit-2026-09.md sección 2.

export const DAYS_OF_WEEK = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'] as const
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number]

export interface WeeklyMenuItem {
  id: string
  productId: string
  productName: string
  productPrice: number
  dayOfWeek: DayOfWeek
  displayOrder: number
  isActive: boolean
}

/** Lo que devuelve la vista dk_today_menu — lo único que n8n necesita consultar. */
export interface TodayMenuEntry {
  productId: string
  productName: string
  price: number
  description: string | null
  category: string | null
  displayOrder: number
  available: true
}
