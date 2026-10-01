import { Button } from '@/shared/ui/Button'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { Input, Select } from '@/shared/ui/FormField'
import { useQuery } from '@tanstack/react-query'
import { Building2, Plus, Search, Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageTitle, StatusPill } from '../components/ui'
import { fetchOrganizations, type OrganizationRow } from '../lib/api'
import { formatShortDate, timeAgo } from '../lib/format'
import { tenantHost, tenantUrl } from '../lib/tenant'

type Sort = 'recent' | 'name' | 'users' | 'activity'

/** All organizations of Quanela (ADR 0019): search, filter, sort, open. */
export function OrganizationsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['ga', 'organizations'], queryFn: fetchOrganizations })
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? 'all'
  const plan = params.get('plan') ?? 'all'
  const ai = params.get('ai') ?? 'all'
  const sort = (params.get('sort') as Sort | null) ?? 'recent'

  const set = (key: string, value: string, fallback: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === fallback) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )

  const plans = useMemo(() => [...new Set((data ?? []).map((o) => o.plan.name).filter(Boolean))] as string[], [data])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const filtered = (data ?? []).filter((o) => {
      if (status === 'active' && !o.active) return false
      if (status === 'inactive' && o.active) return false
      if (plan !== 'all' && o.plan.name !== plan) return false
      if (ai === 'with' && o.aiFeatures.length === 0) return false
      if (ai === 'without' && o.aiFeatures.length > 0) return false
      if (!needle) return true
      return [o.name, o.slug, o.admin.email, o.admin.name, o.city, o.taxId].some((v) => v?.toLowerCase().includes(needle))
    })
    const byTime = (v: string | null) => (v ? new Date(v).getTime() : 0)
    return [...filtered].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name, 'es') : sort === 'users' ? b.users - a.users : sort === 'activity' ? byTime(a.lastActivityAt) - byTime(b.lastActivityAt) : byTime(b.createdAt) - byTime(a.createdAt),
    )
  }, [data, q, status, plan, ai, sort])

  const columns: DataTableColumn<OrganizationRow>[] = [
    {
      key: 'name',
      header: 'Organización',
      cell: (o) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-neutral-100">{o.name}</span>
          <span className="block truncate text-[11px] text-neutral-500">{[o.city, o.country].filter(Boolean).join(', ') || o.slug}</span>
        </span>
      ),
    },
    {
      key: 'subdomain',
      header: 'Subdominio',
      hideBelow: 'md',
      cell: (o) => {
        const url = tenantUrl(o.slug)
        return url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="font-mono text-[11px] text-brasa-300 hover:underline">
            {tenantHost(o.slug)}
          </a>
        ) : (
          <span className="font-mono text-[11px] text-neutral-400">{o.slug}</span>
        )
      },
    },
    { key: 'status', header: 'Estado', cell: (o) => <StatusPill tone={o.active ? 'good' : 'neutral'}>{o.active ? 'Activa' : 'Inactiva'}</StatusPill> },
    {
      key: 'plan',
      header: 'Plan',
      hideBelow: 'md',
      cell: (o) => (
        <span className="text-xs text-neutral-300">
          {o.plan.name ?? '—'}
          {o.plan.status === 'trialing' && <span className="ml-1 text-amber-300">· prueba</span>}
        </span>
      ),
    },
    {
      key: 'admin',
      header: 'Administrador',
      hideBelow: 'lg',
      cell: (o) => (
        <span className="block min-w-0">
          <span className="block truncate text-xs text-neutral-200">{o.admin.name ?? '—'}</span>
          <span className="block truncate text-[11px] text-neutral-500">
            {o.admin.email}
            {!o.admin.activated && <span className="ml-1 text-amber-300">· sin activar</span>}
          </span>
        </span>
      ),
    },
    { key: 'users', header: 'Usuarios', align: 'right', cell: (o) => <span className="tabular-nums">{o.users}</span> },
    {
      key: 'ai',
      header: 'IA',
      align: 'right',
      hideBelow: 'sm',
      cell: (o) =>
        o.aiFeatures.length ? (
          <span className="inline-flex items-center gap-1 text-xs text-neutral-300" title={`${o.aiRuns30d} análisis en 30 días`}>
            <Sparkles size={11} className="text-brasa-400" aria-hidden /> {o.aiFeatures.length}
          </span>
        ) : (
          <span className="text-xs text-neutral-600">—</span>
        ),
    },
    { key: 'activity', header: 'Última actividad', hideBelow: 'md', cell: (o) => <span className="text-xs text-neutral-400">{timeAgo(o.lastActivityAt)}</span> },
    { key: 'created', header: 'Creada', hideBelow: 'lg', cell: (o) => <span className="text-xs text-neutral-400">{formatShortDate(o.createdAt)}</span> },
  ]

  return (
    <>
      <PageTitle
        title="Organizations"
        icon={Building2}
        description={data ? `${data.length} organizaciones en Quanela.` : 'Todas las organizaciones de Quanela.'}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => navigate('/organizations/new')}>
            Crear organización
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500" aria-hidden />
          <Input value={q} onChange={(e) => set('q', e.target.value, '')} placeholder="Buscar por nombre, correo, ciudad o NIT" aria-label="Buscar organizaciones" className="!mt-0 pl-9" />
        </div>
        <Select aria-label="Estado" value={status} onChange={(e) => set('status', e.target.value, 'all')} className="!mt-0 w-auto">
          <option value="all">Todos los estados</option>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
        </Select>
        <Select aria-label="Plan" value={plan} onChange={(e) => set('plan', e.target.value, 'all')} className="!mt-0 w-auto">
          <option value="all">Todos los planes</option>
          {plans.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Select aria-label="IA" value={ai} onChange={(e) => set('ai', e.target.value, 'all')} className="!mt-0 w-auto">
          <option value="all">Con y sin IA</option>
          <option value="with">Con IA</option>
          <option value="without">Sin IA</option>
        </Select>
        <Select aria-label="Ordenar" value={sort} onChange={(e) => set('sort', e.target.value, 'recent')} className="!mt-0 w-auto">
          <option value="recent">Más recientes</option>
          <option value="name">Nombre</option>
          <option value="users">Más usuarios</option>
          <option value="activity">Menos actividad</option>
        </Select>
      </div>
      <DataTable
        columns={columns}
        rows={isLoading ? undefined : rows}
        getRowId={(o) => o.id}
        onRowClick={(o) => navigate(`/organizations/${o.id}`)}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        emptyState={<p className="p-6 text-center text-sm text-neutral-500">Ninguna organización coincide con los filtros.</p>}
      />
    </>
  )
}
