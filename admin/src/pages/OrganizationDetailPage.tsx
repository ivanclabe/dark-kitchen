import { Button } from '@/shared/ui/Button'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, Building2, Copy, Mail, Power, Settings2, Sparkles, Users } from 'lucide-react'
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { PasswordLinkButton } from '../components/PasswordLinkButton'
import { ActivityFeed, ConfirmByName, Metric, PageTitle, Panel, StatusPill } from '../components/ui'
import { fetchOrganization, resendInvitation, setOrganizationActive, type OrganizationDetail } from '../lib/api'
import { featureLabel } from '../lib/features'
import { formatNumber, formatShortDate, timeAgo } from '../lib/format'

type Tab = 'summary' | 'users' | 'activity' | 'configuration'

/**
 * One organization, seen from the platform (ADR 0019): read-only over what
 * belongs to it (its users, settings, activity). The portal only creates,
 * deactivates/reactivates and re-sends the admin invitation; everything
 * operational stays with the organization in Quanela.
 */
export function OrganizationDetailPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { show } = useToast()
  const { data: org, isLoading, isError, error, refetch } = useQuery({ queryKey: ['ga', 'organization', id], queryFn: () => fetchOrganization(id) })
  const [confirming, setConfirming] = useState(false)
  const [manualLink, setManualLink] = useState<string | null>(null)
  const tab = ((params.get('tab') as Tab | null) ?? 'summary') as Tab

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['ga'] })
  }

  const toggle = useMutation({
    mutationFn: (active: boolean) => setOrganizationActive(id, active, org?.name ?? ''),
    onSuccess: async (_, active) => {
      await refresh()
      setConfirming(false)
      show(active ? 'Organización reactivada.' : 'Organización desactivada.')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo cambiar el estado'), 'error'),
  })
  const resend = useMutation({
    mutationFn: () => resendInvitation(id),
    onSuccess: async (r) => {
      await refresh()
      if (r.invitation.sent) show(`Invitación enviada a ${r.adminEmail}.`)
      else {
        setManualLink(r.invitation.activationUrl)
        show('No se pudo enviar el correo: copia el enlace de acceso.', 'error')
      }
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo reenviar la invitación'), 'error'),
  })

  if (isLoading) return <LoadingState variant="cards" rows={2} cols={4} />
  if (isError || !org) return <ErrorState error={error} onRetry={() => void refetch()} />

  const tabs: TabItem<Tab>[] = [
    { value: 'summary', label: 'Resumen', icon: Building2 },
    { value: 'users', label: `Usuarios (${org.userList.length})`, icon: Users },
    { value: 'activity', label: 'Actividad', icon: Activity },
    { value: 'configuration', label: 'Configuración', icon: Settings2 },
  ]

  return (
    <>
      <PageTitle
        backTo={{ to: '/organizations', label: 'Organizations' }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {org.name} <StatusPill tone={org.active ? 'good' : 'neutral'}>{org.active ? 'Activa' : 'Inactiva'}</StatusPill>
          </span>
        }
        description={`Creada el ${formatShortDate(org.createdAt)} · ${org.plan.name ?? 'sin plan'}${org.plan.status === 'trialing' ? ` (prueba hasta ${formatShortDate(org.plan.trialEndsAt)})` : ''}`}
        actions={
          <>
            {org.admin.id && <PasswordLinkButton userId={org.admin.id} />}
            {!org.admin.activated && (
              <Button variant="secondary" icon={Mail} onClick={() => resend.mutate()} loading={resend.isPending}>
                Reenviar invitación
              </Button>
            )}
            {org.active ? (
              <Button variant="ghost" icon={Power} onClick={() => setConfirming(true)}>
                Desactivar
              </Button>
            ) : (
              <Button variant="secondary" icon={Power} onClick={() => toggle.mutate(true)} loading={toggle.isPending}>
                Reactivar
              </Button>
            )}
          </>
        }
      />

      {manualLink && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
          <p className="w-full">No se pudo enviar el correo. Compártelo con el administrador por un canal privado (WhatsApp, por ejemplo). Es de un solo uso, lo deja entrar directo para crear su contraseña y vence en poco tiempo (1 hora, por defecto); si vence, usa «Reenviar invitación».</p>
          <span className="min-w-0 flex-1 break-all font-mono">{manualLink}</span>
          <Button size="sm" variant="secondary" icon={Copy} onClick={() => void navigator.clipboard.writeText(manualLink).then(() => show('Enlace copiado.'))}>
            Copiar enlace
          </Button>
        </div>
      )}

      <div className="mb-5">
        <Tabs value={tab} onChange={(t) => setParams(t === 'summary' ? {} : { tab: t }, { replace: true })} items={tabs} />
      </div>

      {tab === 'summary' && <Summary org={org} />}
      {tab === 'users' && <UsersTab org={org} />}
      {tab === 'activity' && (
        <Panel title="Actividad reciente" subtitle="Últimos 40 eventos de la organización">
          <ActivityFeed items={org.activity} empty="La organización todavía no tiene actividad." />
        </Panel>
      )}
      {tab === 'configuration' && <ConfigurationTab org={org} />}

      <ConfirmByName
        open={confirming}
        title={`Desactivar ${org.name}`}
        description="Nadie de la organización podrá entrar mientras esté desactivada. Sus datos se conservan y puedes reactivarla cuando quieras."
        name={org.name}
        confirmLabel="Desactivar organización"
        pending={toggle.isPending}
        onConfirm={() => toggle.mutate(false)}
        onClose={() => setConfirming(false)}
      />
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-console-800 py-2 text-sm last:border-0">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="min-w-0 text-right text-neutral-200">{children}</dd>
    </div>
  )
}

function Summary({ org }: { org: OrganizationDetail }) {
  const invitation = org.invitation
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Usuarios" value={formatNumber(org.users)} hint={org.pendingUsers ? `${org.pendingUsers} por activar` : 'Todos activos'} icon={Users} />
        <Metric label="Cuentas" value={formatNumber(org.accounts)} icon={Building2} />
        <Metric label="Análisis de IA (30 días)" value={formatNumber(org.aiRuns30d)} hint={`${org.aiFeatures.length} funciones de IA ofrecidas`} icon={Sparkles} tone="brand" />
        <Metric label="Última actividad" value={timeAgo(org.lastActivityAt)} icon={Activity} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Datos">
          <dl>
            <Field label="Administrador">
              {org.admin.name} <span className="block text-xs text-neutral-500">{org.admin.email}</span>
            </Field>
            <Field label="Activación del administrador">
              {org.admin.activated ? (
                <StatusPill tone="good">Activado</StatusPill>
              ) : invitation && new Date(invitation.expiresAt) < new Date() ? (
                <StatusPill tone="bad">Invitación vencida</StatusPill>
              ) : (
                <StatusPill tone="warn">Invitación pendiente{invitation ? ` · vence ${formatShortDate(invitation.expiresAt)}` : ''}</StatusPill>
              )}
            </Field>
            <Field label="Plan">
              {org.plan.name ?? '—'} {org.plan.status && <span className="text-xs text-neutral-500">· {org.plan.status}</span>}
            </Field>
            <Field label="Ubicación">{[org.city, org.country].filter(Boolean).join(', ') || '—'}</Field>
            <Field label="Sector">{[org.sector, org.category].filter(Boolean).join(' · ') || '—'}</Field>
            <Field label="NIT">{org.taxId ?? '—'}</Field>
          </dl>
        </Panel>
        <Panel title="Cuentas" subtitle="Locales o marcas de la organización">
          <ul className="divide-y divide-console-800">
            {org.accountList.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-neutral-200">{a.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-neutral-500">
                  {formatShortDate(a.createdAt)} <StatusPill tone={a.active ? 'good' : 'neutral'}>{a.active ? 'Activa' : 'Inactiva'}</StatusPill>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}

function UsersTab({ org }: { org: OrganizationDetail }) {
  return (
    <Panel>
      <ul className="divide-y divide-console-800">
        {org.userList.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-neutral-100">
                {u.name} {u.isOrganizationAdmin && <StatusPill tone="brand">Organization Admin</StatusPill>}
              </span>
              <span className="block truncate text-[11px] text-neutral-500">
                {u.email} {u.roles.length > 0 && `· ${u.roles.join(', ')}`}
              </span>
            </span>
            <span className="text-xs text-neutral-500">{u.lastSignInAt ? `Último ingreso ${timeAgo(u.lastSignInAt).toLowerCase()}` : 'Nunca ingresó'}</span>
            {u.activeProfile && <PasswordLinkButton userId={u.id} variant="ghost" size="sm" />}
            <StatusPill tone={u.status === 'active' && u.activeProfile ? 'good' : 'warn'}>{!u.activeProfile ? 'Desactivado' : u.status === 'active' ? 'Activo' : 'Pendiente'}</StatusPill>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function ConfigurationTab({ org }: { org: OrganizationDetail }) {
  return (
    <Panel title="Funciones e IA" subtitle="Lo configura la organización en Quanela (IA y voz). Aquí solo se consulta.">
      <ul className="divide-y divide-console-800">
        {org.configuration.map((f) => (
          <li key={f.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
            <span className="min-w-0 flex-1 text-neutral-200">
              {f.label || featureLabel(f.key)}
              <span className="ml-2 text-[11px] text-neutral-500">{f.category === 'ai' ? 'IA' : f.category === 'voice' ? 'Voz' : 'General'}</span>
            </span>
            {!f.includedInPlan ? (
              <StatusPill tone="neutral">No incluida en el plan</StatusPill>
            ) : f.available ? (
              <StatusPill tone="good">Ofrecida · {f.accountsEnabled} {f.accountsEnabled === 1 ? 'cuenta' : 'cuentas'}</StatusPill>
            ) : (
              <StatusPill tone="neutral">No ofrecida</StatusPill>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
