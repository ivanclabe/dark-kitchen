import type { PublicMenu, PublicMenuItem } from '../types'

const item = (id: string, name: string, description: string, category: string, categoryOrder: number, price: number, extra: Partial<PublicMenuItem> = {}): PublicMenuItem => ({
  id,
  name,
  description,
  categoryId: null,
  category,
  categoryOrder,
  price,
  regularPrice: null,
  imagePath: null,
  images: [],
  availableFrom: null,
  availableUntil: null,
  remaining: null,
  availability: 'available',
  ...extra,
})

/** Example dishes so the design can be seen when today's planner is empty (ADR 0053, D5). Never sold. */
export const SAMPLE_ITEMS: PublicMenuItem[] = [
  item('sample-1', 'Bandeja de la casa', 'Arroz, fríjoles, carne asada, chicharrón, huevo, maduro y aguacate.', 'Platos fuertes', 1, 28000),
  item('sample-2', 'Pollo a la plancha', 'Con ensalada fresca y papas criollas.', 'Platos fuertes', 1, 24000, { regularPrice: 27000 }),
  item('sample-3', 'Ajiaco santafereño', 'Con alcaparras, crema de leche y arroz.', 'Sopas', 2, 22000, { remaining: 3 }),
  item('sample-4', 'Limonada de coco', 'Natural, en vaso grande.', 'Bebidas', 3, 9000),
  item('sample-5', 'Postre de natas', 'Receta tradicional.', 'Postres', 4, 8000, { availability: 'sold_out' }),
]

/** The menu for the preview: today's real one, or the example dishes if there are none. */
export function previewMenu(real: PublicMenu | null | undefined, fallback: { name: string; slug: string; iconKey: string | null; tagline: string | null }): { menu: PublicMenu; sample: boolean } {
  if (real && real.items.length > 0) return { menu: real, sample: false }
  const base: PublicMenu = real ?? {
    found: true,
    business: { ...fallback, cuisine: null, whatsapp: null, timezone: 'America/Bogota', currency: 'COP', message: null, openState: { state: 'unconfigured' } },
    ordering: { enabled: true, delivery: true, pickup: true, deliveryFee: 0, minOrder: 0, paymentMethods: ['Efectivo'], transferInstructions: null, autoConfirm: true },
    today: new Date().toISOString().slice(0, 10),
    items: [],
  }
  return { menu: { ...base, items: SAMPLE_ITEMS }, sample: true }
}
