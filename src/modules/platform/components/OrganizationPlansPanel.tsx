import { supabase } from '@/shared/lib/supabase'
import { setSubscription, SUBSCRIPTION_STATUS_LABEL, type SubscriptionStatus } from '@/shared/plans/subscription'
import { usePublicPricing } from '@/shared/plans/usePlans'
import { ActiveBadge } from '@/shared/ui/Badge'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { Select } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate } from '@/shared/utils/format'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

interface OrganizationPlanRow {
  id: string
  name: string
  active: boolean
  plan: string | null
  status: SubscriptionStatus | null
  trialEndsAt: string | null
}

const ORGS_KEY = ['my-kitchens', 'platform', 'organizations'] as const

async function listOrganizationPlans(): Promise<OrganizationPlanRow[]> {
  const { data, error } = await supabase.from('dk_organizations').select('id, name, active, dk_subscriptions ( plan_key, status, trial_ends_at )').order('name')
  if (error) throw error
  return data.map((o) => {
    const raw = o.dk_subscriptions as unknown
    const sub = (Array.isArray(raw) ? raw[0] : raw) as { plan_key: string; status: SubscriptionStatus; trial_ends_at: string | null } | null | undefined
    return { id: o.id, name: o.name, active: o.active, plan: sub?.plan_key ?? null, status: sub?.status ?? null, trialEndsAt: sub?.trial_ends_at ?? null }
  })
}

/**
 * Planes de las organizaciones (ADR 0010, D7): mientras no haya pagos, el
 * cambio de plan (upgrade, downgrade, cancelación) lo hace la plataforma. La
 * base lo exige (dk_set_subscription) y no borra nada al bajar de plan.
 */
export function OrganizationPlansPanel() {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const { data: rows, isLoading, isError, error, refetch } = useQuery({ queryKey: ORGS_KEY, queryFn: listOrganizationPlans })
  const { data: pricing } = usePublicPricing()

  const change = useMutation({
    mutationFn: ({ id, plan, status }: { id: string; plan: string; status?: SubscriptionStatus }) => setSubscription(id, plan, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ORGS_KEY })
      show('Plan actualizado.')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo cambiar el plan'), 'error'),
  })

  const columns: DataTableColumn<OrganizationPlanRow>[] = [
    { key: 'name', header: 'Organización', cell: (o) => <span className="font-medium text-neutral-100">{o.name}</span> },
    { key: 'active', header: 'Estado', hideBelow: 'md', cell: (o) => <ActiveBadge active={o.active} /> },
    {
      key: 'plan',
      header: 'Plan',
      cell: (o) => (
        <Select
          aria-label={`Plan de ${o.name}`}
          value={o.plan ?? ''}
          disabled={change.isPending || !pricing}
          onChange={(e) => change.mutate({ id: o.id, plan: e.target.value })}
          className="!mt-0 max-w-[10rem]"
        >
          {(pricing?.plans ?? []).map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </Select>
      ),
    },
    {
      key: 'status',
      header: 'Suscripción',
      cell: (o) =>
        o.plan && (
          <Select
            aria-label={`Estado de la suscripción de ${o.name}`}
            value={o.status ?? ''}
            disabled={change.isPending}
            onChange={(e) => change.mutate({ id: o.id, plan: o.plan!, status: e.target.value as SubscriptionStatus })}
            className="!mt-0 max-w-[11rem]"
          >
            {(Object.keys(SUBSCRIPTION_STATUS_LABEL) as SubscriptionStatus[]).map((s) => (
              <option key={s} value={s}>
                {SUBSCRIPTION_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        ),
    },
    { key: 'trial', header: 'Prueba hasta', hideBelow: 'lg', cell: (o) => <span className="text-neutral-400">{o.status === 'trialing' && o.trialEndsAt ? formatDate(o.trialEndsAt) : '—'}</span> },
  ]

  return (
    <section className="space-y-3">
      <div>
        <h2 className={typography.h3}>Organizaciones y planes</h2>
        <p className={typography.small}>Sin pagos todavía: aquí se cambia el plan de cada organización. Bajar de plan no borra nada.</p>
      </div>
      <DataTable columns={columns} rows={rows} getRowId={(o) => o.id} isLoading={isLoading} error={isError ? error : undefined} onRetry={() => void refetch()} />
    </section>
  )
}
