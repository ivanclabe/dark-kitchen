import { StatusBadge } from '@/modules/settings/ui/StatusBadge'
import { billingMessage, cancelSubscription, removeSavedCard, resumeSubscription, scheduleChange } from '@/shared/billing/billing'
import { CardPaymentDialog } from '@/shared/billing/CardPaymentDialog'
import { useCheckout, usePaymentReturn } from '@/shared/billing/usePayment'
import { useAuth } from '@/shared/hooks/useAuth'
import { PlanCard } from '@/shared/plans/PlanCard'
import { formatAmount, formatPlanPrice, hasAnnualBilling, type BillingPeriod } from '@/shared/plans/plans'
import type { Subscription } from '@/shared/plans/subscription'
import { usePublicPricing } from '@/shared/plans/usePlans'
import { Button } from '@/shared/ui/Button'
import { cardClass, selectedFillClass } from '@/shared/ui/formClasses'
import { ConfirmDialog, Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { formatDate } from '@/shared/utils/format'
import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CreditCard, Landmark, Loader2 } from 'lucide-react'
import { useState } from 'react'

/**
 * The subscription paid online (ADR 0066): its state, the next renewal, the card
 * that renews it, and the changes (plan, period, cancel). What is charged is
 * always decided by the database; here only the choice is made.
 */
export function SubscriptionCard({ sub, organizationId }: { sub: Subscription; organizationId: string }) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const { session } = useAuth()
  const paymentReturn = usePaymentReturn()
  const checkout = useCheckout(organizationId)
  const [cardOpen, setCardOpen] = useState<null | { planKey?: string; billingPeriod?: BillingPeriod; title: string }>(null)
  const [changeOpen, setChangeOpen] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)
  const canPay = Boolean(sub.canPay)
  const online = sub.mode === 'online' || sub.mode === undefined
  // A renewal to pay, or (without a current period) the activation; an abandoned checkout of a current one asks nothing.
  const due = sub.openInvoice && (sub.openInvoice.kind === 'renewal' || (!sub.isCurrent && sub.openInvoice.kind === 'activation')) ? sub.openInvoice : null
  const needsPayment = sub.status === 'incomplete' || sub.status === 'expired' || sub.status === 'past_due' || (sub.status === 'canceled' && !sub.isCurrent) || Boolean(due)

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true)
    try {
      await action()
      await queryClient.invalidateQueries()
      show(done, 'success')
    } catch (err) {
      show(billingMessage(err, 'No se pudo guardar el cambio').message, 'error')
    } finally {
      setBusy(false)
    }
  }

  let line: string
  if (sub.mode === 'exempt') line = 'Tu plan está acordado con quanela: no se cobra en línea.'
  else if (sub.mode === 'manual') line = 'Pagas por transferencia: nuestro equipo registra cada pago.'
  else if (sub.status === 'incomplete') line = 'Tu suscripción todavía no está activa: paga para empezar.'
  else if (sub.status === 'past_due') line = `No pudimos cobrar la renovación. Paga antes del ${formatDate(sub.graceEndsAt ?? sub.currentPeriodEnd ?? new Date().toISOString())} para no perder el acceso.`
  else if (sub.status === 'expired' || (sub.status === 'canceled' && !sub.isCurrent)) line = 'Tu suscripción terminó. Paga para volver a usar quanela con tus datos intactos.'
  else if (sub.cancelAtPeriodEnd) line = `Cancelada: sigue activa hasta el ${formatDate(sub.currentPeriodEnd!)}.`
  else if (sub.paymentMethod) line = `Se renueva sola el ${formatDate(sub.currentPeriodEnd!)} con ${sub.paymentMethod}.`
  else if (sub.currentPeriodEnd) line = `Se renueva el ${formatDate(sub.currentPeriodEnd)}. Te avisamos unos días antes para que la pagues.`
  else line = ''

  return (
    <section className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-neutral-50">
            {sub.plan.name}
            <StatusBadge status={sub.status} />
          </h2>
          <p className={clsx('mt-1', typography.small)}>{sub.plan.description}</p>
          <p className="mt-2 text-sm text-neutral-300">{formatPlanPrice(sub.plan, sub.billingPeriod)}</p>
        </div>
        {canPay && online && sub.isCurrent && !sub.cancelAtPeriodEnd && (
          <Button variant="secondary" onClick={() => setChangeOpen(true)}>
            Cambiar de plan
          </Button>
        )}
      </div>

      {(paymentReturn.phase === 'checking' || paymentReturn.phase === 'pending') && (
        <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-neutral-800/60 px-3 py-2 text-sm text-neutral-200">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Confirmando tu pago con Wompi…
        </p>
      )}
      {paymentReturn.phase === 'approved' && (
        <p role="status" className="mt-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Pago confirmado. ¡Gracias!
        </p>
      )}
      {paymentReturn.phase === 'declined' && (
        <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {paymentReturn.message}
        </p>
      )}

      {line && <p className={clsx('mt-4 text-sm', sub.status === 'past_due' || sub.status === 'expired' ? 'text-amber-300' : 'text-neutral-300')}>{line}</p>}
      {sub.pendingChange && (
        <p className="mt-2 text-sm text-neutral-400">
          Desde la renovación: {sub.pendingChange.planName} {sub.pendingChange.billingPeriod === 'annual' ? 'anual' : 'mensual'}.{' '}
          {canPay && (
            <button
              type="button"
              className="text-neutral-50 underline-offset-4 hover:underline"
              disabled={busy}
              onClick={() => void run(() => scheduleChange(organizationId, sub.plan.key, sub.billingPeriod), 'Cambio deshecho')}
            >
              Deshacer
            </button>
          )}
        </p>
      )}

      {canPay && online && needsPayment && (
        <div className="mt-4 rounded-xl border border-neutral-800/60 p-4">
          {due && (
            <p className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="text-neutral-400">
                {due.kind === 'renewal' ? 'Renovación' : 'Activación'}
                {due.dueAt ? ` · vence el ${formatDate(due.dueAt)}` : ''}
              </span>
              <span className="text-lg font-semibold text-neutral-50 tabular-nums">
                {formatAmount(due.amount)} {due.currency}
              </span>
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="primary" icon={CreditCard} className="sm:flex-1" onClick={() => setCardOpen({ title: 'Pagar con tarjeta' })}>
              Pagar con tarjeta
            </Button>
            <Button variant="secondary" icon={Landmark} className="sm:flex-1" loading={checkout.busy} onClick={() => void checkout.go()}>
              PSE, Nequi o Bancolombia
            </Button>
          </div>
          {checkout.error && (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {checkout.error}
            </p>
          )}
        </div>
      )}

      {canPay && online && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-neutral-800/60 pt-4 text-sm">
          <span className="text-neutral-400">
            Método de pago: <span className="text-neutral-200">{sub.paymentMethod ?? 'ninguno guardado'}</span>
          </span>
          {sub.isCurrent && !needsPayment && (
            <Button variant="link" size="sm" onClick={() => setCardOpen({ title: sub.paymentMethod ? 'Cambiar la tarjeta' : 'Guardar una tarjeta' })}>
              {sub.paymentMethod ? 'Cambiar tarjeta' : 'Renovar con tarjeta'}
            </Button>
          )}
          {sub.paymentMethod && (
            <Button variant="link" size="sm" disabled={busy} onClick={() => void run(() => removeSavedCard(organizationId), 'Tarjeta quitada')}>
              Quitar tarjeta
            </Button>
          )}
          {sub.isCurrent && (sub.status === 'active' || sub.status === 'past_due') &&
            (sub.cancelAtPeriodEnd ? (
              <Button variant="link" size="sm" disabled={busy} onClick={() => void run(() => resumeSubscription(organizationId), 'Suscripción reactivada')}>
                Reactivar suscripción
              </Button>
            ) : (
              <button type="button" className="text-neutral-500 underline-offset-4 hover:text-neutral-200 hover:underline" onClick={() => setConfirmCancel(true)}>
                Cancelar suscripción
              </button>
            ))}
        </div>
      )}

      {cardOpen && (
        <CardPaymentDialog
          open
          title={cardOpen.title}
          onClose={() => setCardOpen(null)}
          organizationId={organizationId}
          planKey={cardOpen.planKey}
          billingPeriod={cardOpen.billingPeriod}
          defaultEmail={session?.user.email}
          onDone={(r) => {
            setCardOpen(null)
            void queryClient.invalidateQueries()
            show(r.charged ? (r.status === 'APPROVED' ? 'Pago aprobado y tarjeta guardada' : 'Tarjeta guardada; el pago se está confirmando') : 'Tarjeta guardada para la renovación', 'success')
          }}
        />
      )}
      {changeOpen && (
        <ChangePlanDialog
          sub={sub}
          onClose={() => setChangeOpen(false)}
          onUpgradeCard={(planKey, billingPeriod) => {
            setChangeOpen(false)
            setCardOpen({ planKey, billingPeriod, title: 'Pagar la diferencia con tarjeta' })
          }}
          onUpgradeCheckout={(planKey, billingPeriod) => void checkout.go(planKey, billingPeriod)}
          onSchedule={(planKey, billingPeriod) =>
            void run(async () => {
              await scheduleChange(organizationId, planKey, billingPeriod)
              setChangeOpen(false)
            }, 'Cambio programado para la renovación')
          }
          busy={busy || checkout.busy}
        />
      )}
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false)
          void run(() => cancelSubscription(organizationId), 'Suscripción cancelada al final del período')
        }}
        title="Cancelar la suscripción"
        description={`Sigues usando quanela hasta el ${sub.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : 'fin del período'}. Después no se cobra más y el acceso se detiene; tus datos quedan guardados por si vuelves.`}
        confirmLabel="Cancelar suscripción"
        danger
      />
    </section>
  )
}

/** A more expensive plan is paid now (the prorated difference); a cheaper one or another period applies at the renewal. */
function ChangePlanDialog({
  sub,
  onClose,
  onUpgradeCard,
  onUpgradeCheckout,
  onSchedule,
  busy,
}: {
  sub: Subscription
  onClose: () => void
  onUpgradeCard: (planKey: string, period: BillingPeriod) => void
  onUpgradeCheckout: (planKey: string, period: BillingPeriod) => void
  onSchedule: (planKey: string, period: BillingPeriod) => void
  busy: boolean
}) {
  const pricing = usePublicPricing()
  const plans = (pricing.data?.plans ?? []).filter((p) => p.selfServe)
  const [period, setPeriod] = useState<BillingPeriod>(sub.billingPeriod)
  const [planKey, setPlanKey] = useState(sub.plan.key)
  const chosen = plans.find((p) => p.key === planKey)
  const price = (p: (typeof plans)[number], per: BillingPeriod) => (per === 'annual' && p.priceYearly !== null ? p.priceYearly : p.priceMonthly)
  const currentPrice = sub.billingPeriod === 'annual' && sub.plan.priceYearly !== null ? sub.plan.priceYearly : sub.plan.priceMonthly
  const unchanged = planKey === sub.plan.key && period === sub.billingPeriod
  const upgrade = chosen && period === sub.billingPeriod && price(chosen, period) > currentPrice

  return (
    <Modal open onClose={onClose} title="Cambiar de plan" description="Subir de plan se aplica de inmediato y pagas solo la diferencia hasta tu renovación. Bajar de plan o cambiar la periodicidad se aplica al renovar.">
      <div className="space-y-4">
        {hasAnnualBilling(plans) && (
          <div role="group" aria-label="Periodicidad" className="inline-flex rounded-full border border-neutral-800 p-1">
            {(['monthly', 'annual'] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
                className={clsx('rounded-full px-3 py-1 text-sm font-medium', period === p ? selectedFillClass : 'text-neutral-400 hover:text-neutral-100')}
              >
                {p === 'monthly' ? 'Mensual' : 'Anual'}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-3">
          {plans.map((p) => (
            <PlanCard
              key={p.key}
              plan={p}
              period={period}
              selected={p.key === planKey}
              action={
                <Button variant={p.key === planKey ? 'primary' : 'secondary'} size="sm" className="w-full" onClick={() => setPlanKey(p.key)}>
                  {p.key === sub.plan.key ? 'Tu plan' : p.key === planKey ? 'Elegido' : `Elegir ${p.name}`}
                </Button>
              }
            />
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {upgrade ? (
            <>
              <Button variant="secondary" icon={Landmark} disabled={busy} onClick={() => onUpgradeCheckout(planKey, period)}>
                PSE, Nequi o Bancolombia
              </Button>
              <Button variant="primary" icon={CreditCard} disabled={busy} onClick={() => onUpgradeCard(planKey, period)}>
                Pagar la diferencia
              </Button>
            </>
          ) : (
            <Button variant="primary" disabled={busy || unchanged || !chosen} onClick={() => onSchedule(planKey, period)}>
              Aplicar al renovar
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
