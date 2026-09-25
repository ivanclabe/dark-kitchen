/** Mismo formato que exige la base (dk_kitchens.slug): minúsculas, números y guiones, 3–60. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

export function slugError(slug: string): string | null {
  if (slug.length < 3) return 'Mínimo 3 caracteres'
  if (slug.length > 60) return 'Máximo 60 caracteres'
  if (!SLUG_PATTERN.test(slug)) return 'Solo minúsculas, números y guiones (sin espacios ni tildes)'
  return null
}
