import { useAuth } from '@/shared/hooks/useAuth'
import { PlanCard } from '@/shared/plans/PlanCard'
import { formatAmount, hasAnnualBilling, type BillingPeriod } from '@/shared/plans/plans'
import { usePublicPricing } from '@/shared/plans/usePlans'
import { Button, buttonClass } from '@/shared/ui/Button'
import { typography } from '@/shared/ui/typography'
import { formatDate } from '@/shared/utils/format'
import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ArrowLeftRight, CheckCircle2, CreditCard, Landmark, Loader2, LogOut, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { BillingAccess } from './billing'
import { CardPaymentDialog } from './CardPaymentDialog'
import { useCheckout, usePaymentReturn } from './usePayment'
import { selectedFillClass } from '@/shared/ui/formClasses'

const TITLE: Partial<Record<BillingAccess['status'], string>> = {
  incomplete: 'Activa tu suscripción',
  expired: 'Tu suscripción venció',
  canceled: 'Tu suscripción terminó',
  trialing: 'Tu prueba gratis terminó',
  past_due: 'No pudimos cobrar tu suscripción',
}

/**
 * What an organization without a current subscription sees instead of the app
 * (ADR 0066 §2). Who pays chooses plan and period and pays here; everyone else
 * learns why and who can fix it. The database blocks the data anyway: this is
 * the honest face of that block.
 */
export function SubscriptionGate({ access, organizationName }: { access: BillingAccess; organizationName: string }) {
  const paymentReturn = usePaymentReturn()
  const queryClient = useQueryClient()
  const { signOut, session } = useAuth()
  const pricing = usePublicPricing()
  const plans = pricing.data?.plans ?? []
  const selfServe = plans.filter((p) => p.selfServe)
  const sales = plans.find((p) => !p.selfServe)
  const renewal = access.status === 'expired' && access.openRenewalDue !== null
  const [planKey, setPlanKey] = useState(access.planKey)
  const [period, setPeriod] = useState<BillingPeriod>(access.billingPeriod)
  const [cardOpen, setCardOpen] = useState(false)
  const checkout = useCheckout(access.organizationId)
  const chosen = plans.find((p) => p.key === planKey && p.selfServe) ?? selfServe[0]
  const price = chosen ? (period === 'annual' && chosen.priceYearly !== null ? chosen.priceYearly : chosen.priceMonthly) : null

  function done() {
    void queryClient.invalidateQueries()
  }

  let body
  if (paymentReturn.phase === 'checking' || paymentReturn.phase === 'pending') {
    body = (
      <div className="space-y-3 text-center" role="status">
        <Loader2 size={26} className="mx-auto animate-spin text-brasa-400" aria-hidden />
        <p className="font-medium text-neutral-100">Confirmando tu pago con Wompi…</p>
        {paymentReturn.phase === 'pending' && <p className={typography.small}>Con PSE puede tardar unos minutos. Te avisamos aquí apenas Wompi lo confirme.</p>}
      </div>
    )
  } else if (paymentReturn.phase === 'approved') {
    body = (
      <div className="space-y-4 text-center" role="status">
        <CheckCircle2 size={30} className="mx-auto text-emerald-400" aria-hidden />
        <h1 className={typography.h2}>Pago confirmado</h1>
        <p className={typography.small}>La suscripción de {organizationName} está activa. Ya puedes trabajar.</p>
        <Button variant="primary" onClick={done}>
          Entrar a quanela
        </Button>
      </div>
    )
  } else if (!access.canPay) {
    body = (
      <div className="space-y-3 text-center">
        <Wallet size={26} className="mx-auto text-amber-400" aria-hidden />
        <h1 className={typography.h2}>{TITLE[access.status] ?? 'Suscripción pendiente'}</h1>
        <p className={typography.small}>
          La suscripción de <span className="text-neutral-200">{organizationName}</span> no está al día. Pídele a quien administra el negocio que la active desde
          Configuración → Facturación.
        </p>
      </div>
    )
  } else if (!access.paymentsActive) {
    body = (
      <div className="space-y-3 text-center">
        <Wallet size={26} className="mx-auto text-amber-400" aria-hidden />
        <h1 className={typography.h2}>{TITLE[access.status] ?? 'Suscripción pendiente'}</h1>
        <p className={typography.small}>Los pagos en línea se están activando. Escríbenos y activamos tu plan contigo.</p>
        {sales?.contactUrl && (
          <a href={sales.contactUrl} className={buttonClass({ variant: 'primary' })}>
            Escribir a quanela
          </a>
        )}
      </div>
    )
  } else {
    body = (
      <div className="space-y-6">
        <div>
          <h1 className={typography.h1}>{TITLE[access.status] ?? 'Activa tu suscripción'}</h1>
          <p className={clsx('mt-1', typography.small)}>
            {renewal
              ? `Paga la renovación de ${organizationName} y todo vuelve a funcionar, con tus datos intactos.`
              : `${organizationName} ya está creada. Elige tu plan y paga para empezar a usar quanela.`}
          </p>
        </div>

        {paymentReturn.phase === 'declined' && (
          <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {paymentReturn.message}
          </p>
        )}

        {!renewal && (
          <>
            {hasAnnualBilling(plans) && (
              <div role="group" aria-label="Periodicidad" className="inline-flex rounded-full border border-neutral-800 p-1">
                {(['monthly', 'annual'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={period === p}
                    onClick={() => setPeriod(p)}
                    className={clsx(
                      'rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                      period === p ? selectedFillClass : 'text-neutral-400 hover:text-neutral-100',
                    )}
                  >
                    {p === 'monthly' ? 'Mensual' : 'Anual · 2 meses gratis'}
                  </button>
                ))}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {selfServe.map((p) => (
                <PlanCard
                  key={p.key}
                  plan={p}
                  period={period}
                  selected={p.key === chosen?.key}
                  headingLevel="h2"
                  action={
                    <Button variant={p.key === chosen?.key ? 'primary' : 'secondary'} className="w-full" aria-pressed={p.key === chosen?.key} onClick={() => setPlanKey(p.key)}>
                      {p.key === chosen?.key ? 'Elegido' : `Elegir ${p.name}`}
                    </Button>
                  }
                />
              ))}
            </div>
            {sales?.contactUrl && (
              <p className={typography.small}>
                ¿Varias sedes o una cadena?{' '}
                <a href={sales.contactUrl} className="text-brasa-400 underline-offset-4 hover:underline">
                  {sales.name}: {sales.ctaLabel.toLowerCase()}
                </a>
              </p>
            )}
          </>
        )}

        <div className="rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-5">
          {!renewal && chosen && price !== null && (
            <p className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm text-neutral-400">
                {chosen.name} · {period === 'annual' ? 'anual' : 'mensual'}
              </span>
              <span className="text-xl font-semibold text-neutral-50 tabular-nums">
                {formatAmount(price)} {chosen.currency}
              </span>
            </p>
          )}
          {renewal && access.openRenewalDue && <p className="text-sm text-neutral-400">Renovación vencida el {formatDate(access.openRenewalDue)}.</p>}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button variant="primary" size="lg" icon={CreditCard} className="sm:flex-1" onClick={() => setCardOpen(true)}>
              Pagar con tarjeta
            </Button>
            <Button
              variant="secondary"
              size="lg"
              icon={Landmark}
              className="sm:flex-1"
              loading={checkout.busy}
              onClick={() => void checkout.go(renewal ? undefined : chosen?.key, renewal ? undefined : period)}
            >
              PSE, Nequi o Bancolombia
            </Button>
          </div>
          <p className={clsx('mt-3', typography.caption)}>
            Con tarjeta, la suscripción se renueva sola y puedes cancelarla cuando quieras. Con los otros medios te avisamos antes de cada renovación para que la pagues.
            Los pagos los procesa Wompi (Bancolombia).
          </p>
          {checkout.error && (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {checkout.error}
            </p>
          )}
        </div>

        <CardPaymentDialog
          open={cardOpen}
          onClose={() => setCardOpen(false)}
          organizationId={access.organizationId}
          planKey={renewal ? undefined : chosen?.key}
          billingPeriod={renewal ? undefined : period}
          defaultEmail={session?.user.email}
          onDone={() => {
            setCardOpen(false)
            done()
          }}
        />
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-neutral-950 px-4 py-10 text-neutral-100 sm:px-6">
      <main className="mx-auto w-full max-w-3xl">
        {body}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          <Link to="/cuentas" className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-neutral-100">
            <ArrowLeftRight size={14} aria-hidden /> Mis cuentas
          </Link>
          <button type="button" onClick={() => void signOut()} className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-neutral-100">
            <LogOut size={14} aria-hidden /> Cerrar sesión
          </button>
        </div>
      </main>
    </div>
  )
}
