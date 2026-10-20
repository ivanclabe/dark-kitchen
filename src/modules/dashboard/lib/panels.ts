import { useSyncExternalStore } from 'react'

/** The panels of «Destacado» (ADR 0072), in their default order. */
export type PanelKey = 'orders' | 'revenue' | 'averageTicket' | 'kitchenMinutes' | 'cancelledRate' | 'foodCostRate' | 'topProducts' | 'channels'

export const PANEL_LABEL: Record<PanelKey, string> = {
  orders: 'Pedidos',
  revenue: 'Ventas',
  averageTicket: 'Ticket promedio',
  kitchenMinutes: 'Tiempo en cocina',
  cancelledRate: 'Cancelados',
  foodCostRate: 'Costo de comida',
  topProducts: 'Platos más vendidos',
  channels: 'Canales',
}

export const DEFAULT_PANELS: PanelKey[] = ['orders', 'revenue', 'averageTicket', 'kitchenMinutes', 'cancelledRate', 'foodCostRate', 'topProducts', 'channels']

export interface PanelPrefs {
  order: PanelKey[]
  hidden: PanelKey[]
}

const listeners = new Set<() => void>()
const cache = new Map<string, PanelPrefs>()
const key = (scope: string) => `dk-home-panels:${scope}`
const DEFAULT_PREFS: PanelPrefs = { order: DEFAULT_PANELS, hidden: [] }

function read(scope: string): PanelPrefs {
  const cached = cache.get(scope)
  if (cached) return cached
  let prefs = DEFAULT_PREFS
  try {
    const raw = JSON.parse(localStorage.getItem(key(scope)) ?? 'null') as Partial<PanelPrefs> | null
    if (raw && Array.isArray(raw.order)) {
      const known = raw.order.filter((k): k is PanelKey => DEFAULT_PANELS.includes(k as PanelKey))
      // New panels (added after the choice was saved) go at the end.
      const order = [...known, ...DEFAULT_PANELS.filter((k) => !known.includes(k))]
      const hidden = (raw.hidden ?? []).filter((k): k is PanelKey => DEFAULT_PANELS.includes(k as PanelKey))
      prefs = { order, hidden }
    }
  } catch {
    // Blocked storage or garbage: the defaults.
  }
  cache.set(scope, prefs)
  return prefs
}

export function savePanelPrefs(scope: string, prefs: PanelPrefs) {
  cache.set(scope, prefs)
  try {
    localStorage.setItem(key(scope), JSON.stringify(prefs))
  } catch {
    // The choice lasts for this visit.
  }
  listeners.forEach((l) => l())
}

export function resetPanelPrefs(scope: string) {
  cache.delete(scope)
  try {
    localStorage.removeItem(key(scope))
  } catch {
    // Nothing saved.
  }
  listeners.forEach((l) => l())
}

/** Per person and account, on this device (the key carries both). */
export function usePanelPrefs(scope: string): PanelPrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => read(scope),
    () => DEFAULT_PREFS,
  )
}

/** Move a panel one place up or down. */
export function movePanel(prefs: PanelPrefs, panel: PanelKey, by: -1 | 1): PanelPrefs {
  const order = [...prefs.order]
  const i = order.indexOf(panel)
  const j = i + by
  if (i < 0 || j < 0 || j >= order.length) return prefs
  ;[order[i], order[j]] = [order[j], order[i]]
  return { ...prefs, order }
}

export function togglePanel(prefs: PanelPrefs, panel: PanelKey): PanelPrefs {
  return { ...prefs, hidden: prefs.hidden.includes(panel) ? prefs.hidden.filter((k) => k !== panel) : [...prefs.hidden, panel] }
}

/** Highlight cards dismissed on this device (by notice id). */
const DISMISSED_KEY = 'dk-home-dismissed'
export function readDismissed(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(-50) : []
  } catch {
    return []
  }
}
export function dismiss(id: string): string[] {
  const next = [...readDismissed().filter((x) => x !== id), id]
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
  } catch {
    // Dismissed for this visit only.
  }
  return next
}
