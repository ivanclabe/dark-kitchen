import { PlatformAiPanel } from '@/modules/platform/ai/PlatformAiPanel'
import { listPlatformKitchens, setKitchensActive, type PlatformKitchen } from '@/modules/platform/api'
import { OrganizationPlansPanel } from '@/modules/platform/components/OrganizationPlansPanel'
import { Button } from '@/shared/ui/Button'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Pause, Play, Settings, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageTitle, Panel, StatusPill } from '../components/ui'
import { fetchUsers } from '../lib/api'
import { timeAgo } from '../lib/format'

type Section = 'platform' | 'ai' | 'organizations'

const SECTIONS: TabItem<Section>[] = [
  { value: 'platform', label: 'Plataforma', icon: ShieldCheck },
  { value: 'ai', label: 'IA y voz', icon: Sparkles },
  { value: 'organizations', label: 'Organizaciones', icon: Building2 },
]

const ACCOUNTS_KEY = ['ga', 'accounts'] as const

/**
 * Administration (ADR 0019): platform settings only, in three separate
 * blocks. What each organization configures (its AI, voice, roles) stays
 * with the organization in Quanela (ADR 0018).
 */
export function AdministrationPage() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('section') as Section | null
  const section: Section = requested && SECTIONS.some((s) => s.value === requested) ? requested : 'platform'

  return (
    <>
      <PageTitle title="Administration" icon={Settings} description="Configuración de la plataforma. Lo de cada organización se configura en Quanela." />
      <div className="mb-5">
        <Tabs value={section} onChange={(s) => setParams(s === 'platform' ? {} : { section: s }, { replace: true })} items={SECTIONS} />
      </div>
      {section === 'platform' && (
        <div className="space-y-4">
          <GlobalAdmins />
          <OrganizationPlansPanel />
          <Accounts />
        </div>
      )}
      {section === 'ai' && <PlatformAiPanel />}
      {section === 'organizations' && (
        <Panel title="Configuración de las organizaciones">
          <div className="space-y-2 text-sm text-neutral-300">
            <p>Cada organización configura lo suyo desde Quanela: funciones de IA, voz, roles, usuarios y cuentas. El portal no lo cambia, para no mezclar la plataforma con las decisiones de cada negocio.</p>
            <p>
              Desde aquí puedes consultarlo en el detalle de cada organización (pestaña Configuración), y crear, desactivar o reactivar organizaciones en{' '}
              <Link to="/organizations" className="text-brasa-400 hover:underline">
                Organizations
              </Link>
              .
            </p>
          </div>
        </Panel>
      )}
    </>
  )
}

function GlobalAdmins() {
  const { data, isLoading } = useQuery({ queryKey: ['ga', 'users'], queryFn: fetchUsers })
  const admins = (data ?? []).filter((u) => u.globalAdmin)
  return (
    <Panel title="Global Admins" subtitle="Quiénes entran a este portal. Siempre con contraseña y segundo factor (MFA).">
      {isLoading ? (
        <p className="text-sm text-neutral-500">Cargando…</p>
      ) : (
        <ul className="divide-y divide-console-800">
          {admins.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-neutral-100">{u.name}</span>
                <span className="block truncate text-[11px] text-neutral-500">{u.email}</span>
              </span>
              <span className="text-xs text-neutral-500">Último ingreso: {timeAgo(u.lastSignInAt).toLowerCase()}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-neutral-500">Por ahora la lista es de solo lectura; agregar o quitar Global Admins se hace desde la base de datos.</p>
    </Panel>
  )
}

/** Every account of every organization, with bulk on/off (was Quanela's /admin). */
function Accounts() {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ACCOUNTS_KEY, queryFn: listPlatformKitchens })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<{ active: boolean; ids: string[] } | null>(null)

  const toggle = useMutation({
    mutationFn: ({ ids, active }: { ids: string[]; active: boolean }) => setKitchensActive(ids, active),
    onSuccess: async (count, { active }) => {
      await queryClient.invalidateQueries({ queryKey: ['ga'] })
      show(`${count} ${count === 1 ? 'cuenta' : 'cuentas'} ${active ? 'activada' : 'desactivada'}${count === 1 ? '' : 's'}.`)
      setSelected(new Set())
      setConfirm(null)
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo actualizar'), 'error'),
  })

  const allIds = data?.map((k) => k.id) ?? []
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))
  const flip = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const columns: DataTableColumn<PlatformKitchen>[] = [
    {
      key: 'select',
      header: <input type="checkbox" aria-label="Seleccionar todas" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(allIds))} className="size-4 accent-[var(--color-brasa-500)]" />,
      cell: (k) => <input type="checkbox" aria-label={`Seleccionar ${k.name}`} checked={selected.has(k.id)} onChange={() => flip(k.id)} className="size-4 accent-[var(--color-brasa-500)]" />,
    },
    { key: 'name', header: 'Cuenta', cell: (k) => <span className="font-medium text-neutral-100">{k.name}</span> },
    { key: 'organization', header: 'Organización', hideBelow: 'md', cell: (k) => <span className="text-neutral-300">{k.organizationName}</span> },
    { key: 'status', header: 'Estado', cell: (k) => <StatusPill tone={k.active ? 'good' : 'neutral'}>{k.active ? 'Activa' : 'Inactiva'}</StatusPill> },
    {
      key: 'team',
      header: 'Equipo',
      cell: (k) => (
        <span className="inline-flex items-center gap-2 text-neutral-300">
          {k.membersActive}
          {k.admins === 0 && (
            <StatusPill tone="warn">
              <TriangleAlert size={11} aria-hidden /> Sin administrador
            </StatusPill>
          )}
        </span>
      ),
    },
    { key: 'orders', header: 'Pedidos 30 d', align: 'right', hideBelow: 'md', cell: (k) => <span className="tabular-nums text-neutral-300">{k.orders30d}</span> },
    { key: 'last', header: 'Último pedido', hideBelow: 'lg', cell: (k) => <span className="text-xs text-neutral-400">{timeAgo(k.lastOrderAt)}</span> },
  ]

  const ids = [...selected]
  return (
    <Panel title="Cuentas" subtitle="Todas las cuentas (locales o marcas) de todas las organizaciones.">
      {ids.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brasa-500/30 bg-brasa-500/5 px-4 py-2.5 text-sm">
          <span className="mr-auto text-neutral-200">{ids.length} seleccionadas</span>
          <Button size="sm" variant="secondary" icon={Play} onClick={() => setConfirm({ active: true, ids })}>
            Activar
          </Button>
          <Button size="sm" variant="danger" icon={Pause} onClick={() => setConfirm({ active: false, ids })}>
            Desactivar
          </Button>
        </div>
      )}
      <DataTable columns={columns} rows={data} getRowId={(k) => k.id} isLoading={isLoading} error={error} onRetry={() => void refetch()} emptyState={<p className="p-6 text-center text-sm text-neutral-500">Todavía no hay cuentas.</p>} />
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && toggle.mutate(confirm)}
        pending={toggle.isPending}
        danger={confirm?.active === false}
        title={confirm?.active ? 'Activar cuentas' : 'Desactivar cuentas'}
        confirmLabel={confirm?.active ? 'Sí, activar' : 'Sí, desactivar'}
        description={
          confirm?.active ? <p>Sus equipos vuelven a poder operarlas de inmediato.</p> : <p>Sus equipos dejan de poder operarlas de inmediato (pedidos, inventario, todo). Los datos se conservan y puedes reactivarlas cuando quieras.</p>
        }
      />
    </Panel>
  )
}
