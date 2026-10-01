import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/FormField'
import { Modal } from '@/shared/ui/Modal'
import clsx from 'clsx'
import { ArrowLeft, CircleOff } from 'lucide-react'
import { useState, type ComponentType, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { categoryLabel, timeAgo, type RangeKey } from '../lib/format'
import type { ActivityItem } from '../lib/api'

export function PageTitle({
  title,
  description,
  icon: Icon,
  actions,
  backTo,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: ComponentType<{ size?: number; className?: string }>
  actions?: ReactNode
  backTo?: { to: string; label: string }
}) {
  return (
    <header className="mb-6 space-y-3">
      {backTo && (
        <Link to={backTo.to} className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-100">
          <ArrowLeft size={14} aria-hidden /> {backTo.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">
            {Icon && <Icon size={20} className="text-brasa-400" />} {title}
          </h1>
          {description && <p className="mt-1 text-sm text-neutral-400">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

export function Panel({ title, subtitle, actions, children, className }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-2xl border border-console-700 bg-console-900 p-4 sm:p-5', className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function Metric({ label, value, hint, tone = 'neutral', icon: Icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'neutral' | 'brand' | 'good' | 'warn'; icon?: ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="rounded-2xl border border-console-700 bg-console-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-neutral-400">{label}</p>
        {Icon && (
          <span
            className={clsx(
              'inline-flex size-7 items-center justify-center rounded-lg',
              tone === 'brand' ? 'bg-brasa-500/10 text-brasa-400' : tone === 'good' ? 'bg-emerald-500/10 text-emerald-400' : tone === 'warn' ? 'bg-amber-500/10 text-amber-400' : 'bg-console-800 text-neutral-400',
            )}
          >
            <Icon size={14} />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-neutral-50">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-neutral-500">{hint}</p>}
    </div>
  )
}

export function RangePicker({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  const options: { value: RangeKey; label: string }[] = [
    { value: '7d', label: '7 días' },
    { value: '30d', label: '30 días' },
    { value: '90d', label: '90 días' },
  ]
  return (
    <div role="radiogroup" aria-label="Rango de fechas" className="inline-flex rounded-lg border border-console-700 bg-console-900 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx('rounded-md px-3 py-1.5 text-xs font-medium transition-colors', value === o.value ? 'bg-console-700 text-neutral-50' : 'text-neutral-400 hover:text-neutral-100')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const STATUS_TONE = {
  good: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20',
  warn: 'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  bad: 'bg-red-500/10 text-red-300 ring-red-500/20',
  neutral: 'bg-console-800 text-neutral-300 ring-console-700',
  brand: 'bg-brasa-500/10 text-brasa-300 ring-brasa-500/20',
} as const

export function StatusPill({ tone, children }: { tone: keyof typeof STATUS_TONE; children: ReactNode }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', STATUS_TONE[tone])}>{children}</span>
}

/** Data the platform does not record: say it, never invent a number. */
export function NotAvailable({ reason }: { reason: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-neutral-500" title={reason}>
      <CircleOff size={12} aria-hidden /> No disponible
    </span>
  )
}

export function ActivityFeed({ items, empty = 'Sin actividad en este rango.' }: { items: ActivityItem[]; empty?: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-neutral-500">{empty}</p>
  return (
    <ol className="divide-y divide-console-800">
      {items.map((item, i) => {
        const org = typeof item.organization === 'string' ? item.organization : item.organization?.name
        const actor = typeof item.actor === 'string' ? item.actor : item.actor?.name
        return (
          <li key={item.id ?? `${item.at}-${i}`} className="flex items-start gap-3 py-2.5">
            <span className={clsx('mt-1.5 size-1.5 shrink-0 rounded-full', item.result === 'failure' ? 'bg-red-400' : item.category === 'global_admin' ? 'bg-brasa-400' : 'bg-neutral-500')} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-neutral-200">{item.summary ?? item.type}</p>
              <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                {[categoryLabel(item.category), org, actor].filter(Boolean).join(' · ')}
              </p>
            </div>
            <time className="shrink-0 text-[11px] text-neutral-500" dateTime={item.at} title={new Date(item.at).toLocaleString('es-CO')}>
              {timeAgo(item.at)}
            </time>
          </li>
        )
      })}
    </ol>
  )
}

/** Critical actions: type the exact name to confirm. */
export function ConfirmByName({
  open,
  title,
  description,
  name,
  confirmLabel,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: ReactNode
  name: string
  confirmLabel: string
  pending?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const [typed, setTyped] = useState('')
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={pending} disabled={typed !== name}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <label className="block text-xs text-neutral-400">
        Escribe <span className="font-mono text-neutral-200">{name}</span> para confirmar
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus className="!mt-1" />
      </label>
    </Modal>
  )
}
