/**
 * Galerías prediseñadas (ADR 0009, sección 3.1). Un solo sistema visual con
 * dos colecciones: iconos de establecimiento para las Cuentas y avatares de
 * personas para los perfiles. No hay imágenes propias: la base guarda solo
 * la clave y acepta únicamente las de estas listas (CHECK de
 * `dk_kitchens.icon_key` y `dk_users.avatar_key` en la migración
 * 20260926100000_dk_account_icons_person_avatars.sql — mantener iguales).
 */
export const ACCOUNT_ICON_KEYS = [
  'chef',
  'burger',
  'pizza',
  'taco',
  'sushi',
  'ramen',
  'donut',
  'croissant',
  'coffee',
  'icecream',
  'avocado',
  'chili',
  'lemon',
  'egg',
  'cheese',
  'shrimp',
  'whisk',
  'pot',
  'cutlery',
  'flame',
] as const

export type AccountIconKey = (typeof ACCOUNT_ICON_KEYS)[number]

export const ACCOUNT_ICON_LABELS: Record<AccountIconKey, string> = {
  chef: 'Gorro de chef',
  burger: 'Hamburguesa',
  pizza: 'Pizza',
  taco: 'Taco',
  sushi: 'Sushi',
  ramen: 'Ramen',
  donut: 'Dona',
  croissant: 'Croissant',
  coffee: 'Café',
  icecream: 'Helado',
  avocado: 'Aguacate',
  chili: 'Ají',
  lemon: 'Limón',
  egg: 'Huevo',
  cheese: 'Queso',
  shrimp: 'Camarón',
  whisk: 'Batidor',
  pot: 'Olla',
  cutlery: 'Cubiertos',
  flame: 'Llama',
}

export const PERSON_AVATAR_KEYS = [
  'chef-classic',
  'chef-bun',
  'baker',
  'barista',
  'rider',
  'cashier',
  'grill-master',
  'sushi-chef',
  'pizzaiolo',
  'manager',
  'waiter',
  'grandma',
  'curly',
  'hijab',
  'beanie',
  'headphones',
  'cap',
  'braids',
  'robot',
  'cat-chef',
] as const

export type PersonAvatarKey = (typeof PERSON_AVATAR_KEYS)[number]

export const PERSON_AVATAR_LABELS: Record<PersonAvatarKey, string> = {
  'chef-classic': 'Chef con gorro alto',
  'chef-bun': 'Chef con moño',
  baker: 'Panadera con pañoleta',
  barista: 'Barista',
  rider: 'Domiciliario con casco',
  cashier: 'Cajera con diadema',
  'grill-master': 'Parrillero con barba',
  'sushi-chef': 'Sushiman',
  pizzaiolo: 'Pizzero',
  manager: 'Gerente con gafas',
  waiter: 'Mesero con corbatín',
  grandma: 'Abuela cocinera',
  curly: 'Pelo rizado',
  hijab: 'Con hiyab',
  beanie: 'Gorro de lana',
  headphones: 'Con audífonos',
  cap: 'Gorra de visera',
  braids: 'Trenzas',
  robot: 'Robot chef',
  'cat-chef': 'Gato chef',
}

export interface Gallery<K extends string> {
  keys: readonly K[]
  labels: Record<K, string>
  /** Nombre del grupo para lectores de pantalla. */
  label: string
}

export const ACCOUNT_ICONS: Gallery<AccountIconKey> = { keys: ACCOUNT_ICON_KEYS, labels: ACCOUNT_ICON_LABELS, label: 'Icono de la cuenta' }
export const PERSON_AVATARS: Gallery<PersonAvatarKey> = { keys: PERSON_AVATAR_KEYS, labels: PERSON_AVATAR_LABELS, label: 'Avatar' }

export function isGalleryKey<K extends string>(gallery: Gallery<K>, value: unknown): value is K {
  return typeof value === 'string' && (gallery.keys as readonly string[]).includes(value)
}

/**
 * Clave de quien todavía no eligió: siempre la misma para el mismo id, para
 * que una persona o una Cuenta no "cambie de cara" entre sesiones.
 */
export function derivedKey<K extends string>(gallery: Gallery<K>, seed: string | null | undefined): K {
  if (!seed) return gallery.keys[0]
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return gallery.keys[hash % gallery.keys.length]
}

/** La clave guardada si es de la galería; si no (o no hay), la derivada del id. */
export function resolveKey<K extends string>(gallery: Gallery<K>, value: string | null | undefined, seed: string | null | undefined): K {
  return isGalleryKey(gallery, value) ? value : derivedKey(gallery, seed)
}

// Avatares de personas (perfil), con los nombres de siempre.
export const AVATAR_KEYS = PERSON_AVATAR_KEYS
export type AvatarKey = PersonAvatarKey
export const AVATAR_LABELS = PERSON_AVATAR_LABELS
export const isAvatarKey = (value: unknown): value is AvatarKey => isGalleryKey(PERSON_AVATARS, value)
export const defaultAvatarKey = (seed: string | null | undefined): AvatarKey => derivedKey(PERSON_AVATARS, seed)
export const resolveAvatarKey = (value: string | null | undefined, seed: string | null | undefined): AvatarKey => resolveKey(PERSON_AVATARS, value, seed)

// Iconos de Cuenta.
const ICON_HINTS: [RegExp, AccountIconKey][] = [
  [/pizz/i, 'pizza'],
  [/hambur|burger/i, 'burger'],
  [/taco|mexic/i, 'taco'],
  [/sushi|japon/i, 'sushi'],
  [/ramen|wok|asi[aá]t/i, 'ramen'],
  [/caf[eé]|coffee|barista/i, 'coffee'],
  [/helad|ice ?cream/i, 'icecream'],
  [/panader|pastel|croissant|bakery/i, 'croissant'],
  [/don(a|ut)|postre|dulce/i, 'donut'],
  [/\bmar\b|pescad|marisc|camar|cevich/i, 'shrimp'],
  [/parrill|asad|grill|brasa/i, 'flame'],
  [/salud|verde|vegan|ensalad/i, 'avocado'],
]

/** Icono sugerido para una Cuenta nueva según su nombre (se puede cambiar). */
export function suggestAccountIcon(name: string): AccountIconKey {
  return ICON_HINTS.find(([pattern]) => pattern.test(name))?.[1] ?? 'chef'
}

export const isAccountIconKey = (value: unknown): value is AccountIconKey => isGalleryKey(ACCOUNT_ICONS, value)
export const resolveAccountIconKey = (value: string | null | undefined, seed: string | null | undefined): AccountIconKey =>
  resolveKey(ACCOUNT_ICONS, value, seed)
