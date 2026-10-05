import { Avatar } from '@/shared/avatars/Avatar'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { Input, Select } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { typography } from '@/shared/ui/typography'
import { formatDateTime } from '@/shared/utils/format'
import { useInfiniteQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { ChevronDown, ScrollText } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { categoryLabel, EVENT_CATEGORIES, fetchAccountEvents, type AuditEvent, type EventFilters } from '../api'

const SOURCE_LABEL: Record<AuditEvent['source'], string> = { db: 'Base de datos', edge: 'Servicio de IA', app: 'Aplicación' }

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function EventRow({ event }: { event: AuditEvent }) {
  const [open, setOpen] = useState(false)
  const changes = event.changes ? Object.entries(event.changes) : []
  return (
    <li className="relative flex gap-3 py-3 pl-1">
      <div className="flex flex-col items-center">
        {event.actor ? <Avatar avatarKey={event.actor.avatarKey} seed={event.actor.id} size="sm" /> : <span className="size-8 rounded-lg bg-neutral-800" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-neutral-100">
          <span className="font-medium">{event.actor?.name ?? 'Sistema'}</span> <span className="text-neutral-400">·</span> {event.summary}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
          <Badge size="sm" tone="neutral">
            {categoryLabel(event.category)}
          </Badge>
          {event.result === 'failure' && (
            <Badge size="sm" tone="danger" dot>
              Falló
            </Badge>
          )}
          <span title="Origen del registro">{SOURCE_LABEL[event.source]}</span>
          {changes.length > 0 && (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-0.5 text-brasa-400 hover:underline">
              Ver cambios <ChevronDown size={12} className={clsx('transition-transform', open && 'rotate-180')} aria-hidden />
            </button>
          )}
        </div>
        {open && (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border border-neutral-800/60 bg-neutral-950/60 px-3 py-2 text-xs">
            {changes.map(([key, change]) => (
              <div key={key} className="contents">
                <dt className="font-mono text-neutral-500">{key}</dt>
                <dd className="min-w-0 break-words text-neutral-300">
                  <span className="text-neutral-500 line-through">{formatValue(change.from)}</span> → {formatValue(change.to)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </li>
  )
}

/**
 * Bitácora (ADR 0012, sección 5; ADR 0024): ¿quién hizo qué, cuándo y sobre
 * qué en ESTA cuenta? No es observabilidad (¿cómo funciona?). La base la
 * escribe (no la app), es de solo agregar y se lee por páginas (cursor).
 */
export function EventLog() {
  const { kitchen } = useActiveKitchen()
  const [filters, setFilters] = useState<EventFilters>({})
  const search = useDeferredValue(filters.search ?? '')
  const effective = { ...filters, search }

  const query = useInfiniteQuery({
    queryKey: ['account', kitchen.id, 'events', effective],
    queryFn: ({ pageParam }) => fetchAccountEvents(effective, pageParam),
    initialPageParam: undefined as { at: string; id: string } | undefined,
    getNextPageParam: (last) => {
      const tail = last.events.at(-1)
      return last.hasMore && tail ? { at: tail.createdAt, id: tail.id } : undefined
    },
  })
  const events = query.data?.pages.flatMap((p) => p.events) ?? []
  const set = (patch: Partial<EventFilters>) => setFilters((f) => ({ ...f, ...patch }))

  return (
    <div className="space-y-4">
      <p className={typography.caption}>Quién hizo qué y cuándo en esta cuenta. La registra la base de datos y nadie puede modificarla ni borrarla; se conserva 400 días.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={filters.search ?? ''} onChange={(e) => set({ search: e.target.value })} placeholder="Buscar en la bitácora" aria-label="Buscar en la bitácora" className="!mt-0 max-w-xs" />
        <Select value={filters.category ?? ''} onChange={(e) => set({ category: e.target.value || undefined })} aria-label="Filtrar por categoría" className="!mt-0 max-w-[12rem]">
          <option value="">Todas las categorías</option>
          {EVENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={filters.from?.slice(0, 10) ?? ''}
          onChange={(e) => set({ from: e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : undefined })}
          aria-label="Desde"
          className="!mt-0 max-w-[10rem]"
        />
      </div>

      {query.isLoading ? (
        <LoadingState variant="block" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : events.length === 0 ? (
        <EmptyState icon={ScrollText} title="No hay eventos" description="Prueba con otros filtros." compact />
      ) : (
        <>
          <ol className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60 px-4">
            {events.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </ol>
          {query.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                Cargar más
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
