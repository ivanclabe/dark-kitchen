import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Popover } from '@/shared/ui/Popover'
import { Tooltip } from '@/shared/ui/Tooltip'
import clsx from 'clsx'
import {
  AlarmClock,
  Bell,
  BellRing,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Gauge,
  Package,
  Sparkles,
  Wallet,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMarkNotificationsRead, useNotifications } from '../hooks'
import { badgeLabel, notificationsOf, OPEN_NOTIFICATIONS_EVENT, unreadOf, whenLabel, type NotificationTab } from '../lib'
import type { AppNotification } from '../types'

const TYPE_ICON: Record<string, LucideIcon> = {
  late_orders: AlarmClock,
  to_confirm: ClipboardList,
  low_stock: Package,
  overdue_customers: Wallet,
  ai_error: XCircle,
  ai_quota: Gauge,
  trial: CreditCard,
  plan_limit: CreditCard,
}

/** The tone of the icon chip: what matters most stands out, nothing shouts. */
const SEVERITY_CHIP: Record<AppNotification['severity'], string> = {
  error: 'bg-red-500/12 text-red-300 ring-red-500/25',
  warning: 'bg-amber-500/12 text-amber-300 ring-amber-500/25',
  info: 'bg-neutral-800 text-neutral-300 ring-neutral-700/60',
}

function NotificationRow({ n, onOpen }: { n: AppNotification; onOpen: (n: AppNotification) => void }) {
  const Icon = TYPE_ICON[n.type] ?? (n.group === 'ai' ? Sparkles : Bell)
  const ai = n.group === 'ai' && n.type !== 'ai_error' && n.type !== 'ai_quota'
  return (
    <li>
      <button
        type="button"
        role="menuitem"
        onClick={() => onOpen(n)}
        className={clsx(
          'group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-neutral-800/70 focus-visible:bg-neutral-800/70 focus-visible:outline-none',
          n.read && 'opacity-60',
        )}
      >
        <span className={clsx('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ring-1', ai ? 'bg-brasa-500/12 text-brasa-300 ring-brasa-500/25' : SEVERITY_CHIP[n.severity])}>
          <Icon size={15} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1 text-sm font-medium text-neutral-100">{n.title}</span>
            {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brasa-400" aria-label="Sin leer" />}
          </span>
          {n.detail && <span className="mt-0.5 line-clamp-2 block text-xs text-neutral-400">{n.detail}</span>}
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-500">
            {ai && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brasa-500/10 px-1.5 py-0.5 font-medium text-brasa-300">
                <Sparkles size={10} aria-hidden /> IA{n.source ? ` · ${n.source}` : ''}
              </span>
            )}
            <span>{whenLabel(n)}</span>
            <span className="ml-auto inline-flex items-center gap-0.5 font-medium text-neutral-300 group-hover:text-neutral-100">
              {n.action} <ChevronRight size={12} aria-hidden />
            </span>
          </span>
        </span>
      </button>
    </li>
  )
}

function Panel({ close }: { close: () => void }) {
  const { data, isLoading, isError, refetch } = useNotifications()
  const markRead = useMarkNotificationsRead()
  const { path } = useActiveKitchen()
  const navigate = useNavigate()
  const [tab, setTab] = useState<NotificationTab>('all')
  const items = data?.items ?? []
  const list = notificationsOf(items, tab)
  const unread = unreadOf(items, tab)

  function open(n: AppNotification) {
    if (!n.read) markRead.mutate([n.key])
    close()
    navigate(path(n.to))
  }

  const tabs: { value: NotificationTab; label: string }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'ai', label: 'IA' },
  ]

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-2">
        <h2 className="text-sm font-semibold text-neutral-50">Notificaciones</h2>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => markRead.mutate(list.filter((n) => !n.read).map((n) => n.key))}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            <CheckCheck size={13} aria-hidden /> Marcar todo como leído
          </button>
        )}
      </div>
      <div role="tablist" aria-label="Filtrar notificaciones" className="mx-2 mb-2 flex gap-1 rounded-full bg-neutral-950/60 p-1">
        {tabs.map((t) => {
          const count = unreadOf(items, t.value)
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={clsx(
                'flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                tab === t.value ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-400 hover:text-neutral-200',
              )}
            >
              {t.value === 'ai' && <Sparkles size={12} aria-hidden />}
              {t.label}
              {count > 0 && <span className="rounded-full bg-brasa-500/20 px-1.5 text-[10px] text-brasa-200 tabular-nums">{count}</span>}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <p className="px-3 py-8 text-center text-sm text-neutral-500">Cargando…</p>
      ) : isError ? (
        <div className="space-y-2 px-3 py-8 text-center text-sm text-neutral-400">
          <p>No pudimos cargar las notificaciones.</p>
          <button type="button" onClick={() => void refetch()} className="text-brasa-300 hover:underline">
            Reintentar
          </button>
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300">
            <CheckCheck size={18} aria-hidden />
          </span>
          <p className="text-sm font-medium text-neutral-200">{tab === 'ai' ? 'Sin sugerencias de IA por ahora' : 'Todo al día'}</p>
          <p className="max-w-60 text-xs text-neutral-500">
            {tab === 'ai' ? 'Cuando un análisis de IA encuentre algo importante, aparece aquí.' : 'Aquí aparecen los pedidos atrasados, el stock bajo y las sugerencias de IA.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-0.5" aria-label={tab === 'ai' ? 'Notificaciones de IA' : 'Todas las notificaciones'}>
          {list.map((n) => (
            <NotificationRow key={n.key} n={n} onOpen={open} />
          ))}
        </ul>
      )}
      <p className="mt-1 border-t border-neutral-800/60 px-3 pt-2 pb-1 text-[11px] text-neutral-500">Se actualiza cada minuto. Las sugerencias de IA salen de los análisis que ya se hicieron.</p>
    </div>
  )
}

/**
 * The bell (ADR 0037): every notice of the account for this person — operation,
 * AI and the plan — with the unread ones counted on it. Next to the user menu.
 */
export function NotificationBell({ placement }: { placement: 'right-end' | 'bottom-end' }) {
  const { data } = useNotifications()
  const unread = data?.unread ?? 0
  const badge = badgeLabel(unread)
  const label = unread > 0 ? `Notificaciones: ${unread} sin leer` : 'Notificaciones'
  const Icon = unread > 0 ? BellRing : Bell
  const buttonRef = useRef<HTMLButtonElement>(null)
  // There is one bell in the rail and one in the phone's bar: only the visible one opens.
  useEffect(() => {
    function onOpen() {
      const button = buttonRef.current
      if (button && button.offsetParent !== null && button.getAttribute('aria-expanded') !== 'true') button.click()
    }
    window.addEventListener(OPEN_NOTIFICATIONS_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_NOTIFICATIONS_EVENT, onOpen)
  }, [])
  return (
    <Popover
      label="Notificaciones"
      placement={placement}
      className="md:w-[24rem]"
      trigger={(props) => (
        <Tooltip label={label} side={placement === 'right-end' ? 'right' : 'bottom'}>
          <button
            ref={buttonRef}
            type="button"
            {...props}
            aria-label={label}
            className="relative flex size-10 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500"
          >
            <Icon size={19} aria-hidden />
            {badge && (
              <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brasa-500 px-1 text-[10px] font-semibold text-white tabular-nums ring-2 ring-neutral-950">
                {badge}
              </span>
            )}
          </button>
        </Tooltip>
      )}
    >
      {(close) => <Panel close={close} />}
    </Popover>
  )
}
