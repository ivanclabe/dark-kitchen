/** ADR 0052 — the public menu (what the database returns) and its cart. */
import type { ThemeDesign } from './lib/themes'

export type Availability = 'available' | 'sold_out' | 'later' | 'ended'
export type Fulfillment = 'delivery' | 'pickup'
export type PublicPaymentMethod = 'Efectivo' | 'Transferencia' | 'Tarjeta'

export interface OpenState {
  state: 'open' | 'closed' | 'unconfigured'
  closes_at?: string | null
  opens_at?: string | null
}

export interface PublicMenuItem {
  id: string
  name: string
  description: string | null
  categoryId: string | null
  category: string
  categoryOrder: number
  price: number
  regularPrice: number | null
  imagePath: string | null
  images: string[]
  availableFrom: string | null
  availableUntil: string | null
  remaining: number | null
  availability: Availability
}

export interface PublicMenu {
  found: true
  business: {
    name: string
    slug: string
    iconKey: string | null
    cuisine: string | null
    tagline: string | null
    whatsapp: string | null
    timezone: string
    currency: string
    message: string | null
    openState: OpenState
  }
  ordering: {
    enabled: boolean
    delivery: boolean
    pickup: boolean
    deliveryFee: number
    minOrder: number
    paymentMethods: PublicPaymentMethod[]
    transferInstructions: string | null
    autoConfirm: boolean
    /** ADR 0055: the business sends order notices by WhatsApp (offer the opt-in). */
    whatsappNotices?: boolean
  }
  today: string
  items: PublicMenuItem[]
  /** ADR 0053: the published design (presentation only); null = the default look. */
  theme?: ThemeDesign | null
}

export interface CartLine {
  productId: string
  quantity: number
  note: string
}

export interface PlaceOrderInput {
  idempotencyKey: string
  customer: { name: string; phone: string }
  fulfillment: Fulfillment
  address: string
  reference: string
  paymentMethod: PublicPaymentMethod
  notes: string
  items: CartLine[]
  /** ADR 0055: the customer accepts order notices by WhatsApp. */
  whatsappOptIn?: boolean
  /** Honeypot: people never fill it. */
  website: string
}

export interface PlaceOrderResult {
  orderNumber: number
  token: string
  status: string
  confirmed: boolean
  subtotal?: number
  deliveryFee?: number
  total?: number
  repeated: boolean
}

export type PlaceOrderErrorCode = 'closed' | 'not_accepting' | 'unavailable' | 'limit' | 'stock' | 'min_order' | 'invalid' | 'rate_limited' | 'network'

export interface OrderStatus {
  found: true
  orderNumber: number
  status: 'NUEVO' | 'CONFIRMADO' | 'EN_PREPARACION' | 'LISTO' | 'DESPACHADO' | 'ENTREGADO' | 'CANCELADO'
  fulfillment: Fulfillment | null
  createdAt: string
  updatedAt: string
  deliveryAddress: string | null
  paymentMethod: string | null
  subtotal: number
  deliveryFee: number
  total: number
  items: { name: string; quantity: number; unitPrice: number; lineTotal: number; note: string | null }[]
  business: { name: string; slug: string; iconKey: string | null; whatsapp: string | null; transferInstructions: string | null; theme?: ThemeDesign | null }
}

/** What the staff module reads and saves. */
export interface PublicMenuSettings {
  slug: string
  name: string
  iconKey: string | null
  whatsapp: string | null
  tagline: string | null
  published: boolean
  publishedAt: string | null
  ordersEnabled: boolean
  delivery: boolean
  pickup: boolean
  deliveryFee: number
  minOrder: number
  paymentMethods: PublicPaymentMethod[]
  transferInstructions: string | null
  autoConfirm: boolean
  message: string | null
  openState: OpenState
  hasHours: boolean
  /** ADR 0053 */
  theme: ThemeDesign | null
  themeDraft: ThemeDesign | null
  themePublishedAt: string | null
  hasPreviousTheme: boolean
}

/** ADR 0054 — a design kept in «Mis diseños» (never public by itself). */
export type MenuDesignSource = 'ai' | 'editor' | 'published' | 'draft_backup'

export interface MenuDesign {
  id: string
  name: string
  design: ThemeDesign
  source: MenuDesignSource
  prompt: string | null
  summary: string | null
  parentId: string | null
  favorite: boolean
  createdAt: string
  lastPublishedAt: string | null
  createdBy: string | null
  /** Only right after the AI made it: colors it fixed so the text reads well. */
  contrastFixed?: string[]
}
