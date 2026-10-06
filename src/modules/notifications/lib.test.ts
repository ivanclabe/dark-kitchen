import { describe, expect, it } from 'vitest'
import { badgeLabel, notificationsOf, operationNotices, splitCount, unreadAiAdvice, unreadOf, whenLabel } from './lib'
import type { AppNotification } from './types'

const n = (over: Partial<AppNotification>): AppNotification => ({
  key: over.key ?? Math.random().toString(36),
  group: 'operation',
  type: 'late_orders',
  severity: 'info',
  title: 'x',
  detail: null,
  to: '/',
  action: 'Ver',
  at: '2026-10-06T15:00:00Z',
  ongoing: false,
  read: false,
  ...over,
})

describe('notifications (ADR 0037)', () => {
  it('a tab lists the unread first, then the newest; IA only the AI ones', () => {
    const items = [
      n({ key: 'old-read', read: true, at: '2026-10-06T16:00:00Z' }),
      n({ key: 'ai', group: 'ai', type: 'kitchen_insights', at: '2026-10-06T14:00:00Z' }),
      n({ key: 'new', at: '2026-10-06T15:30:00Z' }),
    ]
    expect(notificationsOf(items, 'all').map((i) => i.key)).toEqual(['new', 'ai', 'old-read'])
    expect(notificationsOf(items, 'ai').map((i) => i.key)).toEqual(['ai'])
    expect(unreadOf(items)).toBe(2)
    expect(unreadOf(items, 'ai')).toBe(1)
  })

  it('the badge: nothing at zero, 9+ above nine', () => {
    expect(badgeLabel(0)).toBeNull()
    expect(badgeLabel(4)).toBe('4')
    expect(badgeLabel(12)).toBe('9+')
  })

  it('when: «Ahora» for a current condition, relative for what happened', () => {
    const now = new Date('2026-10-06T15:20:00Z')
    expect(whenLabel({ at: '2026-10-06T15:00:00Z', ongoing: true }, now)).toBe('Ahora')
    expect(whenLabel({ at: '2026-10-06T15:15:00Z', ongoing: false }, now)).toBe('Hace 5 min')
    expect(whenLabel({ at: '2026-10-06T12:20:00Z', ongoing: false }, now)).toBe('Hace 3 h')
    expect(whenLabel({ at: '2026-10-05T12:20:00Z', ongoing: false }, now)).toBe('Ayer')
  })

  it('Inicio: the figure apart from what it is', () => {
    expect(splitCount('3 pedidos atrasados')).toEqual({ count: 3, label: 'pedidos atrasados' })
    expect(splitCount('La prueba gratis terminó')).toEqual({ count: null, label: 'La prueba gratis terminó' })
  })

  it('Inicio: only the operation notices, most urgent first; the AI line counts unread advice only', () => {
    const items = [
      n({ key: 'stock', type: 'low_stock' }),
      n({ key: 'late', type: 'late_orders' }),
      n({ key: 'plan', group: 'account', type: 'trial' }),
      n({ key: 'ai-1', group: 'ai', type: 'kitchen_insights' }),
      n({ key: 'ai-2', group: 'ai', type: 'supply_reorder', read: true }),
      n({ key: 'ai-err', group: 'ai', type: 'ai_error' }),
    ]
    expect(operationNotices(items).map((i) => i.key)).toEqual(['late', 'stock'])
    expect(unreadAiAdvice(items)).toBe(1)
  })
})
