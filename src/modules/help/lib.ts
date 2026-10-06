import { KB } from '../../../supabase/functions/_shared/kb.ts'
import { APP_ENTRY } from '@/shared/tenant/navigation'
import { searchKb, type KbHit } from '../../../supabase/functions/_shared/kbSearch.ts'
import { stripHelpPrefix } from '@/shared/help/helpUrl'
import { currentHost, docsUrl, rootUrl } from '@/shared/tenant/host'
import { HELP_ARTICLES, HELP_SECTIONS } from './generated/helpContent'
import type { HelpArticle, HelpSection } from './types'

export { HELP_ARTICLES, HELP_SECTIONS }

/** Who an article is written for (the `audience` of its metadata). */
export const AUDIENCE_LABEL: Record<string, string> = {
  everyone: 'Todos',
  owner: 'Dueño del negocio',
  admin: 'Administración',
  manager: 'Gerencia',
  cashier: 'Caja',
  kitchen: 'Cocina',
  inventory: 'Inventario',
  delivery: 'Domiciliarios',
}

export function sectionOf(id: string): HelpSection | undefined {
  return HELP_SECTIONS.find((s) => s.id === id)
}

export function articlesOf(section: HelpSection): HelpArticle[] {
  return section.articles.map((id) => HELP_ARTICLES[id]).filter(Boolean)
}

/** The previous and next articles, in the order of the side menu. */
export function neighbours(article: HelpArticle): { prev: HelpArticle | null; next: HelpArticle | null } {
  const order = HELP_SECTIONS.flatMap((s) => s.articles)
  const i = order.indexOf(article.id)
  return { prev: i > 0 ? HELP_ARTICLES[order[i - 1]] : null, next: i >= 0 && i < order.length - 1 ? HELP_ARTICLES[order[i + 1]] : null }
}

/** The same search «Oye Quanela» uses (ADR 0034). */
export function searchHelp(query: string, limit = 8): KbHit[] {
  return searchKb(query, KB, { limit })
}

export function formatUpdated(date: string): string {
  const d = new Date(`${date}T12:00:00`)
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** The one official address of a help page for search engines: doc.quanela.com (ADR 0035, D7). */
export function setCanonical(path: string) {
  const url = docsUrl(stripHelpPrefix(path))
  let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!url) {
    link?.remove()
    return
  }
  if (!link) {
    link = document.createElement('link')
    link.rel = 'canonical'
    document.head.append(link)
  }
  link.href = url
}

/**
 * «Abrir en Quanela»: inside the app, the screen itself; from doc.quanela.com,
 * the sign-in of quanela.com, which then opens that screen in the person's
 * own account (ADR 0035, D6).
 */
export function appHref(path: string): string {
  if (currentHost().kind !== 'docs') return path
  return rootUrl(`/login?next=${encodeURIComponent(path)}`) ?? path
}

/** «Entrar» / «Volver a Quanela» of the help center's header. */
export function appHomeHref(signedIn: boolean): string {
  const path = signedIn ? APP_ENTRY : '/login'
  return currentHost().kind === 'docs' ? (rootUrl(path) ?? path) : path
}
