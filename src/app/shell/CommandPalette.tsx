import { listCustomersPage } from '@/modules/customers/api/customers'
import { searchOrders } from '@/modules/orders/api/orders'
import { useProducts } from '@/modules/products/hooks/useProducts'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { canAccessAnyModule } from '@/shared/rbac/roles'
import { formatMoney } from '@/shared/utils/format'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { ArrowRight, ClipboardList, CornerDownLeft, Search, ShieldCheck, Soup, UserRound, Users, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ADMIN_NAV_ITEMS, NAV_ITEMS } from '../navigation'
import { useShellActions } from './shellActionsContext'
import { navSubsections } from './subsections'

interface Entry {
  id: string
  /** A section inside a module: listed only when the query names it. */
  sub?: boolean
  group: string
  label: string
  hint?: string
  icon: LucideIcon
  keywords: string
  run: () => void
}

const SEARCH_DELAY_MS = 200

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/**
 * Buscar y crear (ADR 0072): one box to go anywhere the role can open, create what it can create, and find a
 * customer, an order or a dish. Everything it reads goes through the same queries (and permissions) as each
 * module; nothing new is exposed. Keyboard first: arrows, Enter, Escape.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const active = useActiveKitchen()
  const { can, path } = active
  const navigate = useNavigate()
  const { actions, create } = useShellActions()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const opener = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null)

  useEffect(() => {
    inputRef.current?.focus()
    const back = opener.current
    return () => {
      if (back instanceof HTMLElement) back.focus()
    }
  }, [])
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), SEARCH_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [query])

  const go = (to: string) => () => {
    onClose()
    navigate(path(to))
  }
  const canCustomers = can('customers.view')
  const canOrders = can('orders.view')
  const canDishes = canAccessAnyModule(can, ['menuPlanner'])
  const searching = debounced.length >= 2

  const customers = useQuery({
    queryKey: ['palette', 'customers', active.kitchen.id, debounced],
    queryFn: () =>
      listCustomersPage({ search: debounced, status: 'all', sort: null, dir: null, page: 0, pageSize: 5, createdFrom: null, createdTo: null, minOrders: null, minBalance: null, maxBalance: null }),
    enabled: searching && canCustomers,
    staleTime: 30_000,
  })
  const orders = useQuery({
    queryKey: ['palette', 'orders', active.kitchen.id, debounced],
    queryFn: () => searchOrders({ search: debounced, limit: 5 }),
    enabled: searching && canOrders,
    staleTime: 30_000,
  })
  const products = useProducts(canDishes)

  const staticEntries = useMemo<Entry[]>(() => {
    const subs = navSubsections(active)
    const modules = [...NAV_ITEMS, ...ADMIN_NAV_ITEMS].filter((item) => canAccessAnyModule(can, item.modules))
    const nav: Entry[] = modules.flatMap((item) => [
      { id: `go:${item.to}`, group: 'Ir a', label: item.label, hint: item.description, icon: item.icon, keywords: `${item.label} ${item.description}`, run: go(item.to) },
      ...(subs[item.to] ?? []).map((s) => ({
        id: `go:${item.to}>${s.to}`,
        group: 'Ir a',
        label: `${item.label} › ${s.label}`,
        icon: item.icon,
        keywords: `${item.label} ${s.label}`,
        sub: true,
        run: go(s.to),
      })),
    ])
    return [
      ...actions.map((a) => ({ id: `create:${a.kind}`, group: 'Crear', label: a.label, icon: a.icon, keywords: `${a.label} crear nuevo ${a.keywords}`, run: () => create(a.kind) })),
      ...nav,
      { id: 'go:/perfil', group: 'Ir a', label: 'Mi perfil', icon: UserRound, keywords: 'perfil contraseña avatar', run: go('/perfil') },
      { id: 'go:/perfil/privacidad', group: 'Ir a', label: 'Privacidad y datos', icon: ShieldCheck, keywords: 'privacidad datos solicitud reembolso pqr', run: go('/perfil/privacidad') },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, actions, create])

  const entries = useMemo<Entry[]>(() => {
    const q = normalize(query)
    // Without a query: create and the modules. With one: what is named like it first, then what describes it.
    const named = (e: Entry) => normalize(e.label).startsWith(q) || normalize(e.label).split(/[\s›]+/).some((w) => w.startsWith(q))
    const matching = !q
      ? staticEntries.filter((e) => !e.sub)
      : [...staticEntries.filter(named), ...staticEntries.filter((e) => !e.sub && !named(e) && normalize(e.keywords).includes(q))].toSorted((a, b) =>
          a.group === b.group ? 0 : a.group === 'Crear' ? -1 : b.group === 'Crear' ? 1 : 0,
        )
    if (!searching) return matching
    const found: Entry[] = []
    for (const c of customers.data?.rows ?? []) {
      found.push({ id: `customer:${c.id}`, group: 'Clientes', label: c.fullName, hint: c.phone ?? undefined, icon: Users, keywords: '', run: go(`/customers/${c.id}`) })
    }
    for (const o of orders.data?.orders ?? []) {
      found.push({
        id: `order:${o.id}`,
        group: 'Pedidos',
        label: `Pedido #${o.orderNumber} · ${o.customerName}`,
        hint: formatMoney(o.total),
        icon: ClipboardList,
        keywords: '',
        run: go(`/operations/${o.id}`),
      })
    }
    for (const p of (products.data ?? []).filter((p) => normalize(p.name).includes(normalize(debounced))).slice(0, 5)) {
      found.push({ id: `dish:${p.id}`, group: 'Platos', label: p.name, hint: p.categoryName ?? undefined, icon: Soup, keywords: '', run: go(`/menu-planner?plato=${p.id}`) })
    }
    return [...matching, ...found]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staticEntries, query, searching, debounced, customers.data, orders.data, products.data])

  const current = Math.min(highlighted, Math.max(entries.length - 1, 0))
  const optionId = (i: number) => `${listId}-${i}`
  useEffect(() => {
    document.getElementById(optionId(current))?.scrollIntoView?.({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((i) => Math.min(i + 1, entries.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      entries[current]?.run()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const loading = searching && (customers.isFetching || orders.isFetching)

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center sm:px-4 sm:pt-[12dvh]">
      <div className="motion-backdrop absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar y crear"
        className="motion-pop relative flex h-dvh w-full flex-col overflow-hidden border-neutral-800 bg-neutral-900 shadow-float sm:h-auto sm:max-h-[70dvh] sm:max-w-xl sm:rounded-2xl sm:border"
      >
        <div className="flex items-center gap-3 border-b border-neutral-800 px-4">
          <Search size={18} className="shrink-0 text-neutral-500" aria-hidden />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={entries.length ? optionId(current) : undefined}
            aria-autocomplete="list"
            aria-label="Buscar o crear"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setHighlighted(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Busca un cliente, un pedido, un plato o una sección…"
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-neutral-50 outline-none placeholder:text-neutral-500 sm:text-sm"
          />
          <button type="button" onClick={onClose} className="rounded-md border border-neutral-800 px-1.5 py-0.5 text-2xs text-neutral-500 hover:text-neutral-200">
            Esc
          </button>
        </div>
        <div id={listId} role="listbox" aria-label="Resultados" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {entries.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-neutral-500">{loading ? 'Buscando…' : `Nada coincide con «${query.trim()}».`}</p>
          ) : (
            entries.map((entry, i) => {
              const Icon = entry.icon
              const groupStart = i === 0 || entries[i - 1].group !== entry.group
              return (
                <div key={entry.id}>
                  {groupStart && <p className="px-3 pt-3 pb-1 text-xs font-medium text-neutral-500 first:pt-1">{entry.group}</p>}
                  <div
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === current}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      entry.run()
                    }}
                    onMouseEnter={() => setHighlighted(i)}
                    className={clsx(
                      'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm',
                      i === current ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-200',
                    )}
                  >
                    <Icon size={16} className={clsx('shrink-0', i === current ? 'text-brasa-400' : 'text-neutral-500')} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    {entry.hint && <span className="hidden max-w-[45%] truncate text-xs text-neutral-500 sm:block">{entry.hint}</span>}
                    {i === current && <CornerDownLeft size={14} className="shrink-0 text-neutral-500" aria-hidden />}
                  </div>
                </div>
              )
            })
          )}
          {searching && loading && entries.length > 0 && <p className="px-3 py-2 text-xs text-neutral-500">Buscando más resultados…</p>}
        </div>
        <div className="hidden items-center gap-4 border-t border-neutral-800 px-4 py-2 text-2xs text-neutral-500 sm:flex">
          <span>↑ ↓ para moverte</span>
          <span className="flex items-center gap-1">
            <ArrowRight size={11} aria-hidden /> Enter para abrir
          </span>
          <span className="ml-auto">⌘K o Ctrl+K desde cualquier pantalla</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
