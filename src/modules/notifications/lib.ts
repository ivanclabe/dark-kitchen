import type { AppNotification } from './types'

export type NotificationTab = 'all' | 'ai'

/** The notices of a tab: unread first, then the newest. */
export function notificationsOf(items: AppNotification[], tab: NotificationTab): AppNotification[] {
  return items
    .filter((n) => tab === 'all' || n.group === 'ai')
    .toSorted((a, b) => Number(a.read) - Number(b.read) || Date.parse(b.at) - Date.parse(a.at))
}

export function unreadOf(items: AppNotification[], tab: NotificationTab = 'all'): number {
  return items.filter((n) => !n.read && (tab === 'all' || n.group === 'ai')).length
}

/** «9+» on the bell. */
export function badgeLabel(unread: number): string | null {
  if (unread <= 0) return null
  return unread > 9 ? '9+' : String(unread)
}

/** «Ahora» for a current condition; «hace 5 min», «hace 2 h», «ayer» for something that happened. */
export function whenLabel(n: Pick<AppNotification, 'at' | 'ongoing'>, now: Date = new Date()): string {
  if (n.ongoing) return 'Ahora'
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(n.at)) / 60_000))
  if (minutes < 1) return 'Hace un momento'
  if (minutes < 60) return `Hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `Hace ${hours} h`
  return hours < 48 ? 'Ayer' : `Hace ${Math.round(hours / 24)} días`
}

/** «3 pedidos atrasados» → 3 and «pedidos atrasados» (the operation notices start with their figure). */
export function splitCount(title: string): { count: number | null; label: string } {
  const m = /^(\d+)\s+(.+)$/.exec(title.trim())
  return m ? { count: Number(m[1]), label: m[2] } : { count: null, label: title }
}

/** The order of Inicio's «Necesita atención»: the operation first, then the administration (ADR 0063). */
const NOTICE_ORDER = [
  'late_orders',
  'to_confirm',
  'low_stock',
  'overdue_customers',
  'below_cost',
  'payables_overdue',
  'open_shifts',
  'price_up',
  'payables_due',
  'amount_pending',
  'invoices_unsaved',
  'old_drafts',
  'above_target',
]

/** Inicio shows the operation and administration notices; AI and the plan live in the bell (ADR 0037, D5). */
export function operationNotices(items: AppNotification[]): AppNotification[] {
  const rank = (type: string) => (NOTICE_ORDER.includes(type) ? NOTICE_ORDER.indexOf(type) : NOTICE_ORDER.length)
  return items.filter((n) => n.group === 'operation' || n.group === 'admin').toSorted((a, b) => rank(a.type) - rank(b.type))
}

/** The AI advice not seen yet (not the failures or the quota): the line of Inicio. */
export function unreadAiAdvice(items: AppNotification[]): number {
  return items.filter((n) => n.group === 'ai' && !n.read && n.type !== 'ai_error' && n.type !== 'ai_quota' && n.type !== 'ai_budget').length
}

/** Asks the visible bell to open (from Inicio's AI line). */
export const OPEN_NOTIFICATIONS_EVENT = 'dk:open-notifications'
