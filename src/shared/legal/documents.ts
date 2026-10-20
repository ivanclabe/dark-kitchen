import { LEGAL_DOCUMENTS, type LegalDocument } from './generated/legalContent'

export type { LegalDocument }
export { LEGAL_COMPANY, LEGAL_DOCUMENTS, LEGAL_PENDING_COMPANY_FIELDS } from './generated/legalContent'

/** A document version as the database knows it (dk_legal_documents). */
export interface DocumentRef {
  slug: string
  version: string
}

export function legalDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((d) => d.slug === slug)
}

export const legalHref = (slug: string) => `/legal/${slug}`

/** The documents of Quanela itself, in reading order (the business's policy lives in each public menu). */
export const QUANELA_DOCUMENTS = LEGAL_DOCUMENTS.filter((d) => d.slug !== 'politica-cocina')

/** What everyone accepts to use Quanela: Terms and Data Policy (two separate checkboxes, ADR 0071). */
export const SIGNUP_DOCUMENTS: DocumentRef[] = ['terminos', 'privacidad'].map((slug) => {
  const doc = legalDocument(slug)!
  return { slug, version: doc.version }
})

export function documentRef(slug: string): DocumentRef {
  const doc = legalDocument(slug)
  if (!doc) throw new Error(`Unknown legal document ${slug}`)
  return { slug, version: doc.version }
}

/** How a business identifies itself in its own privacy policy (dk_public_kitchen_privacy). */
export interface KitchenPrivacy {
  name: string
  legalName: string | null
  taxId: string | null
  phone: string | null
  address: string | null
  city: string | null
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const KITCHEN_FIELD: Record<string, (k: KitchenPrivacy) => string | null> = {
  nombre: (k) => k.name,
  razonSocial: (k) => k.legalName,
  nit: (k) => k.taxId,
  direccion: (k) => k.address,
  ciudad: (k) => k.city,
  telefono: (k) => k.phone,
}

/**
 * The business's policy (a template, ADR 0071) with its own data. A field it has not filled in says so,
 * instead of being left blank or invented.
 */
export function kitchenPolicyHtml(html: string, kitchen: KitchenPrivacy): string {
  return html.replace(/<span data-kitchen="(\w+)"><\/span>/g, (_, field: string) => {
    const value = KITCHEN_FIELD[field]?.(kitchen)?.trim()
    return value ? escapeHtml(value) : '<span class="legal-unset">(no publicado por el negocio)</span>'
  })
}

export function kitchenPolicyTitle(title: string, kitchen: Pick<KitchenPrivacy, 'name'>): string {
  return title.replace(/\{\{cocina\.nombre\}\}/g, kitchen.name)
}
