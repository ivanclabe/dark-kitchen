import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { Drawer } from '@/shared/ui/Drawer'
import { ErrorState } from '@/shared/ui/ErrorState'
import { Input, Select } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { useQuery } from '@tanstack/react-query'
import { Search, ShieldCheck, Users } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PasswordLinkButton } from '../components/PasswordLinkButton'
import { ActivityFeed, PageTitle, StatusPill } from '../components/ui'
import { fetchUser, fetchUsers, type UserRow } from '../lib/api'
import { featureLabel } from '../lib/features'
import { formatNumber, formatShortDate, timeAgo } from '../lib/format'

const STATUS: Record<UserRow['status'], { label: string; tone: 'good' | 'warn' | 'neutral' }> = {
  active: { label: 'Activo', tone: 'good' },
  pending: { label: 'Pendiente', tone: 'warn' },
  disabled: { label: 'Desactivado', tone: 'neutral' },
}

/** Every user of Quanela, across organizations (ADR 0019). Read-only. */
export function UsersPage() {
  const [params, setParams] = useSearchParams()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['ga', 'users'], queryFn: fetchUsers })
  const q = params.get('q') ?? ''
  const org = params.get('org') ?? 'all'
  const role = params.get('role') ?? 'all'
  const status = params.get('status') ?? 'all'
  const selected = params.get('user')

  const set = (key: string, value: string | null, fallback: string | null = null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === fallback || value == null) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )

  const organizations = useMemo(() => {
    const map = new Map<string, string>()
    for (const u of data ?? []) for (const o of u.organizations) map.set(o.id, o.name)
    return [...map].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [data])
  const roles = useMemo(() => [...new Set((data ?? []).flatMap((u) => u.roles))].sort((a, b) => a.localeCompare(b, 'es')), [data])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data ?? []).filter((u) => {
      if (org !== 'all' && !u.organizations.some((o) => o.id === org)) return false
      if (role === 'global_admin' && !u.globalAdmin) return false
      if (role === 'org_admin' && !u.organizations.some((o) => o.isOrganizationAdmin)) return false
      if (role !== 'all' && role !== 'global_admin' && role !== 'org_admin' && !u.roles.includes(role)) return false
      if (status !== 'all' && u.status !== status) return false
      if (!needle) return true
      return [u.name, u.email, ...u.organizations.map((o) => o.name)].some((v) => v?.toLowerCase().includes(needle))
    })
  }, [data, q, org, role, status])

  const columns: DataTableColumn<UserRow>[] = [
    {
      key: 'name',
      header: 'Usuario',
      cell: (u) => (
        <span className="block min-w-0">
          <span className="flex items-center gap-1.5 truncate font-medium text-neutral-100">
            {u.name}
            {u.globalAdmin && <ShieldCheck size={13} className="shrink-0 text-brasa-400" aria-label="Global Admin" />}
          </span>
          <span className="block truncate text-[11px] text-neutral-500">{u.email ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'org',
      header: 'Organización',
      hideBelow: 'md',
      cell: (u) =>
        u.organizations.length ? (
          <span className="block truncate text-xs text-neutral-300">
            {u.organizations.map((o) => o.name + (o.isOrganizationAdmin ? ' (admin)' : '')).join(', ')}
          </span>
        ) : (
          <span className="text-xs text-neutral-600">—</span>
        ),
    },
    { key: 'roles', header: 'Roles', hideBelow: 'lg', cell: (u) => <span className="block truncate text-xs text-neutral-400">{u.roles.join(', ') || '—'}</span> },
    { key: 'status', header: 'Estado', cell: (u) => <StatusPill tone={STATUS[u.status].tone}>{STATUS[u.status].label}</StatusPill> },
    { key: 'last', header: 'Último ingreso', hideBelow: 'sm', cell: (u) => <span className="text-xs text-neutral-400">{timeAgo(u.lastSignInAt)}</span> },
    { key: 'ai', header: 'IA (30 d)', align: 'right', hideBelow: 'lg', cell: (u) => <span className="tabular-nums text-xs text-neutral-300">{formatNumber(u.aiRuns30d)}</span> },
  ]

  return (
    <>
      <PageTitle title="Users" icon={Users} description={data ? `${data.length} usuarios en todas las organizaciones.` : 'Todos los usuarios de Quanela.'} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500" aria-hidden />
          <Input value={q} onChange={(e) => set('q', e.target.value, '')} placeholder="Buscar por nombre, correo u organización" aria-label="Buscar usuarios" className="!mt-0 pl-9" />
        </div>
        <Select aria-label="Organización" value={org} onChange={(e) => set('org', e.target.value, 'all')} className="!mt-0 w-auto max-w-56">
          <option value="all">Todas las organizaciones</option>
          {organizations.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <Select aria-label="Rol" value={role} onChange={(e) => set('role', e.target.value, 'all')} className="!mt-0 w-auto">
          <option value="all">Todos los roles</option>
          <option value="global_admin">Global Admin</option>
          <option value="org_admin">Organization Admin</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <Select aria-label="Estado" value={status} onChange={(e) => set('status', e.target.value, 'all')} className="!mt-0 w-auto">
          <option value="all">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="pending">Pendientes</option>
          <option value="disabled">Desactivados</option>
        </Select>
      </div>
      <DataTable
        columns={columns}
        rows={isLoading ? undefined : rows}
        getRowId={(u) => u.id}
        onRowClick={(u) => set('user', u.id)}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        emptyState={<p className="p-6 text-center text-sm text-neutral-500">Ningún usuario coincide con los filtros.</p>}
      />
      {selected && <UserDrawer id={selected} onClose={() => set('user', null)} />}
    </>
  )
}

function UserDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: u, isLoading, isError, error, refetch } = useQuery({ queryKey: ['ga', 'user', id], queryFn: () => fetchUser(id) })
  return (
    <Drawer open onClose={onClose} title={u?.name ?? 'Usuario'} subtitle={u?.email ?? undefined} size="md">
      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError || !u ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={STATUS[u.status].tone}>{STATUS[u.status].label}</StatusPill>
            {u.globalAdmin && <StatusPill tone="brand">Global Admin</StatusPill>}
          </div>
          {!u.globalAdmin && u.status !== 'disabled' && <PasswordLinkButton userId={u.id} />}
          <dl className="space-y-1.5">
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Creado</dt>
              <dd className="text-neutral-200">{formatShortDate(u.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Último ingreso</dt>
              <dd className="text-neutral-200">{timeAgo(u.lastSignInAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Análisis de IA (30 días)</dt>
              <dd className="text-neutral-200">{formatNumber(u.aiRuns30d)}</dd>
            </div>
          </dl>
          <section>
            <h3 className="mb-1.5 text-xs font-semibold text-neutral-400">Organizaciones y cuentas</h3>
            {u.accounts.length === 0 ? (
              <p className="text-neutral-500">Sin cuentas asignadas.</p>
            ) : (
              <ul className="divide-y divide-console-800">
                {u.accounts.map((a, i) => (
                  <li key={`${a.organization}-${a.name}-${i}`} className="flex justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate text-neutral-200">
                      {a.name} <span className="text-[11px] text-neutral-500">· {a.organization}</span>
                    </span>
                    <span className="shrink-0 text-xs text-neutral-400">{a.role ?? '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {u.aiFeaturesUsed.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold text-neutral-400">Funciones de IA usadas</h3>
              <p className="text-neutral-300">{u.aiFeaturesUsed.map(featureLabel).join(', ')}</p>
            </section>
          )}
          <section>
            <h3 className="mb-1.5 text-xs font-semibold text-neutral-400">Actividad reciente</h3>
            <ActivityFeed items={u.activity} empty="Sin actividad registrada." />
          </section>
        </div>
      )}
    </Drawer>
  )
}
