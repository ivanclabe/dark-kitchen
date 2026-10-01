import { Button } from '@/shared/ui/Button'
import { ErrorState } from '@/shared/ui/ErrorState'
import { Input, Select } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Activity, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ActivityFeed, PageTitle, Panel, RangePicker } from '../components/ui'
import { fetchActivity, fetchOrganizations } from '../lib/api'
import { categoryLabel } from '../lib/format'
import { useRange } from '../lib/useRange'

const PAGE = 50

/** Everything recorded in dk_audit_log, across organizations (ADR 0019). */
export function ActivityPage() {
  const range = useRange()
  const [params, setParams] = useSearchParams()
  const org = params.get('org') ?? ''
  const category = params.get('category') ?? ''
  const search = params.get('q') ?? ''
  const page = Math.max(0, Number(params.get('page') ?? 0) || 0)
  const [typed, setTyped] = useState(search)

  const set = (patch: Record<string, string>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        // Any filter change starts again from the first page.
        if (!('page' in patch)) next.delete('page')
        return next
      },
      { replace: true },
    )

  const organizations = useQuery({ queryKey: ['ga', 'organizations'], queryFn: fetchOrganizations })
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['ga', 'activity', range.key, org, category, search, page],
    queryFn: () => fetchActivity({ from: range.from, to: range.to, organizationId: org || null, category: category || null, search, limit: PAGE, offset: page * PAGE }),
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <PageTitle title="Activity" icon={Activity} description="Lo que pasa en Quanela: altas, accesos, cambios, IA y acciones del portal." actions={<RangePicker value={range.key} onChange={range.setKey} />} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-56 flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            set({ q: typed.trim() })
          }}
        >
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500" aria-hidden />
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onBlur={() => typed.trim() !== search && set({ q: typed.trim() })}
            placeholder="Buscar en la descripción y presiona Enter"
            aria-label="Buscar actividad"
            className="!mt-0 pl-9"
          />
        </form>
        <Select aria-label="Organización" value={org} onChange={(e) => set({ org: e.target.value })} className="!mt-0 w-auto max-w-56">
          <option value="">Todas las organizaciones</option>
          {organizations.data?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Tipo" value={category} onChange={(e) => set({ category: e.target.value })} className="!mt-0 w-auto">
          <option value="">Todos los tipos</option>
          {data?.categories.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </Select>
      </div>
      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError || !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <Panel className={isFetching ? 'opacity-70 transition-opacity' : undefined}>
          <ActivityFeed items={data.items} empty="No hay actividad con estos filtros." />
          {(page > 0 || data.items.length === PAGE) && (
            <div className="mt-3 flex items-center justify-between border-t border-console-800 pt-3 text-xs text-neutral-500">
              <span>
                Eventos {page * PAGE + 1}–{page * PAGE + data.items.length}
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="ghost" icon={ChevronLeft} disabled={page === 0} onClick={() => set({ page: page > 1 ? String(page - 1) : '' })}>
                  Anteriores
                </Button>
                <Button size="sm" variant="ghost" icon={ChevronRight} disabled={data.items.length < PAGE} onClick={() => set({ page: String(page + 1) })}>
                  Siguientes
                </Button>
              </span>
            </div>
          )}
        </Panel>
      )}
    </>
  )
}
