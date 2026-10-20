import { financeTabs } from '@/modules/finance/lib/tabs'
import { integrationsTabs } from '@/modules/integrations/lib/tabs'
import { OPERATIONS_VIEW_LABEL, operationsViews } from '@/modules/operations/lib/views'
import { settingsSections } from '@/modules/settings/sections'
import { supplyViews } from '@/modules/supply/lib/views'
import type { ActiveKitchen } from '@/shared/kitchen/activeKitchenContext'

/** A section inside a module, shown nested under it in the sidebar (ADR 0072). `to` may carry a ?view=. */
export interface NavSubsection {
  to: string
  label: string
}

/**
 * The sections of each module the active role can open: the same lists (and permission rules) the module's own
 * page uses for its tabs, so the sidebar never offers a section the page would hide.
 */
export function navSubsections(active: Pick<ActiveKitchen, 'can' | 'canShared'>): Record<string, NavSubsection[]> {
  const { can } = active
  return {
    '/operations': operationsViews(can).map((v) => ({ to: `/operations?view=${v}`, label: OPERATIONS_VIEW_LABEL[v] })),
    '/supply': supplyViews(can).map((v) => ({ to: `/supply/${v.value}`, label: v.label })),
    '/finance': financeTabs(can).map((t) => ({ to: `/finance/${t.value}`, label: t.label })),
    '/integrations': integrationsTabs(can).map((t) => ({ to: `/integrations/${t.value}`, label: t.label })),
    '/public-menu': [
      { to: '/public-menu', label: 'Resumen' },
      { to: '/public-menu/design', label: 'Diseño' },
    ],
    '/staff': [
      { to: '/staff', label: 'Hoy' },
      { to: '/staff?view=week', label: 'Semana' },
      { to: '/staff?view=hours', label: 'Horas' },
    ],
    '/users': [
      { to: '/users', label: 'Usuarios' },
      { to: '/users/roles', label: 'Roles y permisos' },
    ],
    '/settings': settingsSections(active).map((s) => ({ to: s.to, label: s.label })),
  }
}

/**
 * Is this subsection the one on screen? `section` is the path inside the account, `search` its query.
 * A subsection with ?view= matches that view; the plain one matches when no view is asked for (or, for
 * modules whose first section is the bare path, an exact path).
 */
export function isSubsectionActive(sub: NavSubsection, section: string, search: string, siblings: NavSubsection[]): boolean {
  const [path, query = ''] = sub.to.split('?')
  const wanted = new URLSearchParams(query).get('view')
  const current = new URLSearchParams(search).get('view')
  if (wanted) return section === path && current === wanted
  const sameView = siblings.some((s) => s.to.startsWith(`${path}?view=`))
  if (sameView) return section === path && !current
  // The most specific path wins (/users/roles over /users).
  const matches = (p: string) => section === p || section.startsWith(`${p}/`)
  if (!matches(path)) return false
  return !siblings.some((s) => s !== sub && s.to.length > path.length && !s.to.includes('?') && matches(s.to))
}
