import { CUISINES, DIETARY_TAGS, type StorefrontMetricsPreview, type StorefrontProduct, type StorefrontState } from '../api/storefront'

/** The sections of the module (ADR 0046), each its own address: /consumer, /consumer/perfil, /consumer/platos. */
export type ConsumerSection = 'resumen' | 'perfil' | 'platos'

/** Where each section lives (Resumen is the module's own address). */
export const consumerPath = (section: ConsumerSection) => (section === 'resumen' ? '/consumer' : `/consumer/${section}`)

/** Where a missing item gets fixed. */
export type FixTarget = { section: ConsumerSection } | { path: string }

export interface ReadinessItem {
  id: string
  label: string
  done: boolean
  /** Without it, publishing is not offered. */
  required: boolean
  /** What is missing (or what is there), in plain words. */
  detail: string
  fix: FixTarget
}

export interface Readiness {
  items: ReadinessItem[]
  /** The required ones are done. */
  canPublish: boolean
  done: number
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The published dishes and how complete they are. */
export function dishFigures(products: StorefrontProduct[]) {
  const published = products.filter((p) => p.published)
  return {
    active: products.length,
    published: published.length,
    withPhoto: published.filter((p) => p.image_path).length,
    withDescription: published.filter((p) => p.has_description).length,
    withTags: published.filter((p) => p.dietary_tags.length > 0).length,
  }
}

/**
 * ADR 0046 (D3): what a business needs before customers see it, from what
 * the database already says (dk_storefront_get). The profile and one
 * published dish are required; the rest makes the recommendation better.
 */
export function readinessOf(state: StorefrontState): Readiness {
  const s = state.storefront
  const dishes = dishFigures(state.products)
  const items: ReadinessItem[] = [
    // ADR 0047: the identity is the account's (Configuración → General), so it is always there.
    {
      id: 'identity',
      label: 'Nombre y dirección pública',
      done: Boolean(state.account.name && state.account.slug),
      required: true,
      detail: `Apareces como «${state.account.name}» (${state.account.slug}), los de tu cuenta.`,
      fix: { path: '/settings/general' },
    },
    {
      id: 'dishes',
      label: 'Platos publicados',
      done: dishes.published > 0,
      required: true,
      detail: dishes.published > 0 ? `${plural(dishes.published, 'plato', 'platos')} de ${dishes.active} activos.` : 'Elige al menos un plato para mostrar.',
      fix: { section: 'platos' },
    },
    {
      id: 'cuisine',
      label: 'Tipo de cocina',
      done: Boolean(s?.cuisine ?? state.defaults.cuisine),
      required: false,
      detail: s?.cuisine ?? state.defaults.cuisine
        ? `${cuisineLabel(s?.cuisine ?? state.defaults.cuisine)}${state.account.cuisine ? '' : ' (como el negocio)'}`
        : 'Ayuda a que te encuentren («quiero hamburguesas»). Se elige en Configuración → General.',
      fix: { path: '/settings/general' },
    },
    {
      id: 'tagline',
      label: 'Frase corta',
      done: Boolean(s?.tagline),
      required: false,
      detail: s?.tagline ? `«${s.tagline}»` : 'Una línea que diga qué te hace distinto.',
      fix: { section: 'perfil' },
    },
    {
      id: 'location',
      label: 'Ubicación',
      done: s?.latitude != null,
      required: false,
      detail: s?.latitude != null ? 'Quanela puede decir a qué distancia estás.' : 'Sin ella, Quanela no puede decir a qué distancia estás.',
      fix: { section: 'perfil' },
    },
    {
      id: 'hours',
      label: 'Horario',
      done: state.open_state !== null && state.open_state.state !== 'unconfigured',
      required: false,
      detail:
        state.open_state && state.open_state.state !== 'unconfigured'
          ? state.open_state.state === 'open'
            ? 'Ahora se ve «Abierto».'
            : 'Ahora se ve «Cerrado».'
          : 'Sin horario, Quanela no puede decir si estás abierto. Se configura en Cocina.',
      fix: { path: '/operations?view=kitchen' },
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp para pedidos',
      done: Boolean(s?.whatsapp_phone),
      required: false,
      detail: s?.whatsapp_phone ? 'El cliente puede enviarte su pedido.' : 'Sin él, el cliente no puede enviarte el pedido desde Quanela.',
      fix: { section: 'perfil' },
    },
    {
      id: 'photos',
      label: 'Fotos de los platos',
      done: dishes.published > 0 && dishes.withPhoto === dishes.published,
      required: false,
      detail: dishes.published === 0 ? 'Primero publica platos.' : `${dishes.withPhoto} de ${dishes.published} publicados tienen foto.`,
      fix: { section: 'platos' },
    },
    {
      id: 'descriptions',
      label: 'Descripciones',
      done: dishes.published > 0 && dishes.withDescription === dishes.published,
      required: false,
      detail: dishes.published === 0 ? 'Primero publica platos.' : `${dishes.withDescription} de ${dishes.published} publicados tienen descripción.`,
      fix: { section: 'platos' },
    },
  ]
  return {
    items,
    canPublish: items.filter((i) => i.required).every((i) => i.done),
    done: items.filter((i) => i.done).length,
  }
}

/** «preparación ~15 min, confirmación ~2 min…» from the real medians (null: not enough orders yet). */
export function sharedTimes(m: StorefrontMetricsPreview): string | null {
  const parts = [
    m.prep_minutes != null ? `preparación ~${m.prep_minutes} min` : null,
    m.response_minutes != null ? `confirmación ~${m.response_minutes} min` : null,
    m.delivery_minutes != null ? `domicilio ~${m.delivery_minutes} min` : null,
    m.completion_rate != null ? `${Math.round(m.completion_rate * 100)} % de pedidos cumplidos` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

export const cuisineLabel = (value: string | null | undefined) => (value ? (CUISINES.find((c) => c.value === value)?.label ?? value) : null)
export const tagLabel = (value: string) => DIETARY_TAGS.find((t) => t.value === value)?.label ?? value

export type DishFilter = 'all' | 'published' | 'hidden' | 'no_photo' | 'no_description'

/** The dishes list (ADR 0046, D5): by name or category, and by what they are missing. */
export function filterDishes(products: StorefrontProduct[], drafts: Record<string, { published: boolean }>, filter: DishFilter, search: string): StorefrontProduct[] {
  const term = search.trim().toLowerCase()
  return products.filter((p) => {
    if (term && !p.name.toLowerCase().includes(term) && !(p.category ?? '').toLowerCase().includes(term)) return false
    const published = drafts[p.id]?.published ?? p.published
    switch (filter) {
      case 'published':
        return published
      case 'hidden':
        return !published
      case 'no_photo':
        return !p.image_path
      case 'no_description':
        return !p.has_description
      default:
        return true
    }
  })
}
