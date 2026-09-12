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
