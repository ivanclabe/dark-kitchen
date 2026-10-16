import { Button } from '@/shared/ui/Button'
import { ErrorState } from '@/shared/ui/ErrorState'
import { Input } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BILLING_OVERVIEW_KEY, fetchBillingOverview, setBillingSetting, SUBSCRIPTION_LABEL, type BillingSettingKey } from '../lib/billing'
import { formatDateTimeShort, formatShortDate } from '../lib/format'
import { Metric, Panel, StatusPill } from './ui'

/**
 * The platform's two switches for subscriptions (ADR 0066 §2) and how they are
 * doing. Online payments first (sandbox, then production); the block only after
 * confirming that real payments arrive and activate.
 */
export function BillingPlatformPanel() {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: BILLING_OVERVIEW_KEY, queryFn: fetchBillingOverview })
  const [confirmEnforce, setConfirmEnforce] = useState(false)
  const save = useMutation({
    mutationFn: ({ key, value }: { key: BillingSettingKey; value: string }) => setBillingSetting(key, value),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ga'] })
      show('Ajuste guardado.')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar'), 'error'),
  })

  if (isLoading) return <LoadingState variant="block" />
  if (isError || !data) return <ErrorState error={error} onRetry={() => void refetch()} />
  const on = (key: BillingSettingKey) => data.settings[key] === 'true'
  const c = data.counts

  return (
    <Panel title="Suscripciones y cobros" subtitle="Pagos con Wompi y bloqueo de las organizaciones sin suscripción vigente (ADR 0066)">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-xl border border-console-700 p-3">
          <div>
            <p className="text-sm font-medium text-neutral-100">Pagos en línea</p>
            <p className="text-xs text-neutral-500">Muestra el checkout de Wompi a quien paga. Requiere las llaves configuradas en las funciones (primero sandbox).</p>
          </div>
          <Switch
            checked={on('billing_payments_active')}
            label="Pagos en línea"
            disabled={save.isPending}
            onChange={(v) => save.mutate({ key: 'billing_payments_active', value: String(v) })}
          />
        </div>
        <div className="flex items-start justify-between gap-4 rounded-xl border border-console-700 p-3">
          <div>
            <p className="text-sm font-medium text-neutral-100">Bloquear sin suscripción vigente</p>
            <p className="text-xs text-neutral-500">Las organizaciones sin pago (no exentas) dejan de operar y solo ven la pantalla de pago. Las exentas nunca se bloquean.</p>
          </div>
          <Switch
            checked={on('billing_enforced')}
            label="Bloquear sin suscripción vigente"
            disabled={save.isPending}
            onChange={(v) => (v ? setConfirmEnforce(true) : save.mutate({ key: 'billing_enforced', value: 'false' }))}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <DaysSetting label="Días de gracia tras un cobro fallido" value={data.settings.billing_grace_days ?? '3'} onSave={(v) => save.mutate({ key: 'billing_grace_days', value: v })} />
          <DaysSetting label="Aviso antes de renovar (días)" value={data.settings.billing_renewal_notice_days ?? '5'} onSave={(v) => save.mutate({ key: 'billing_renewal_notice_days', value: v })} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Activas" value={c.active} />
          <Metric label="Sin activar" value={c.incomplete} tone={c.incomplete ? 'warn' : 'neutral'} />
          <Metric label="Pago pendiente" value={c.pastDue} tone={c.pastDue ? 'warn' : 'neutral'} />
          <Metric label="Vencidas" value={c.expired} tone={c.expired ? 'warn' : 'neutral'} />
          <Metric label="En prueba" value={c.trialing} />
          <Metric label="Exentas" value={c.exempt} />
        </div>
        {(c.failedRenewals7d > 0 || c.invalidEvents7d > 0 || c.mismatches7d > 0) && (
          <ul className="space-y-1 text-sm text-amber-300">
            {c.failedRenewals7d > 0 && <li>{c.failedRenewals7d} renovaciones automáticas fallaron en 7 días.</li>}
            {c.invalidEvents7d > 0 && <li>{c.invalidEvents7d} eventos de Wompi con firma inválida en 7 días (revisa el secreto de eventos).</li>}
            {c.mismatches7d > 0 && <li>{c.mismatches7d} pagos con un monto distinto al de la factura en 7 días.</li>}
          </ul>
        )}

        {data.attention.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">Requieren atención</p>
            <ul className="divide-y divide-console-800">
              {data.attention.map((a) => (
                <li key={a.organizationId} className="flex items-center gap-3 py-2 text-sm">
                  <Link to={`/organizations/${a.organizationId}?tab=billing`} className="min-w-0 flex-1 truncate text-neutral-100 hover:underline">
                    {a.name}
                  </Link>
                  <StatusPill tone={a.status === 'expired' ? 'bad' : 'warn'}>{SUBSCRIPTION_LABEL[a.status]}</StatusPill>
                  <span className="text-xs text-neutral-500">{a.since ? formatShortDate(a.since) : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">Últimos eventos de Wompi</p>
          {data.recentEvents.length === 0 ? (
            <p className="text-sm text-neutral-500">Todavía no llegan eventos.</p>
          ) : (
            <ul className="space-y-1 text-xs text-neutral-400">
              {data.recentEvents.map((e, i) => (
                <li key={`${e.reference}-${i}`} className="flex flex-wrap gap-x-2">
                  <span className="font-mono text-neutral-300">{e.reference ?? '—'}</span>
                  <span>{e.status}</span>
                  <StatusPill tone={e.valid ? 'good' : 'bad'}>{e.valid ? 'firma válida' : 'firma inválida'}</StatusPill>
                  {e.result && <span>· {e.result}</span>}
                  {e.environment && <span>· {e.environment}</span>}
                  <span className="text-neutral-600">· {formatDateTimeShort(e.receivedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmEnforce}
        onClose={() => setConfirmEnforce(false)}
        onConfirm={() => {
          setConfirmEnforce(false)
          save.mutate({ key: 'billing_enforced', value: 'true' })
        }}
        title="Bloquear las organizaciones sin pago"
        description={`Desde ya, ${c.incomplete + c.expired} organizaciones sin suscripción vigente dejarán de operar hasta pagar. Hazlo solo después de confirmar un pago real en producción.`}
        confirmLabel="Encender el bloqueo"
        danger
      />
    </Panel>
  )
}

function DaysSetting({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-console-700 p-3 text-sm text-neutral-300">
      {label}
      <span className="flex items-center gap-2">
        <Input aria-label={label} inputMode="numeric" className="!mt-0 w-16 text-center" value={draft} onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        <Button variant="secondary" size="sm" disabled={draft === value || draft === ''} onClick={() => onSave(draft)}>
          Guardar
        </Button>
      </span>
    </label>
  )
}
