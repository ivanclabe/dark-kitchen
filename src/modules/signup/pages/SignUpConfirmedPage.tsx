import { FullScreenLoading } from '@/app/FullScreenLoading'
import { useAuth } from '@/shared/hooks/useAuth'
import { kitchenPath, MY_KITCHENS_KEY } from '@/shared/kitchen/activeKitchenContext'
import { fetchMyContext } from '@/shared/kitchen/kitchensApi'
import { tenantHostLabel, tenantUrl } from '@/shared/tenant/host'
import { PlanCard } from '@/shared/plans/PlanCard'
import { clearSelectedPlan, usePublicPricing } from '@/shared/plans/usePlans'
import { Button } from '@/shared/ui/Button'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, CheckCircle2, Copy, Loader2, RotateCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { createOrganization, PLAN_NOT_AVAILABLE, pendingOrganizationOf, pendingPlanOf, updatePendingPlan } from '../api'

/**
 * Vuelta del enlace de confirmación (y "termina de crear tu negocio" si la
 * persona entró por /login): crea en una transacción la organización, su
 * suscripción con el plan elegido, la primera Cuenta y los roles (ADR 0010),
 * y entra directo con una bienvenida. Idempotente: abrir el enlace dos veces
 * lleva a la misma Cuenta. Si el plan ya no se puede elegir, pide otro sin
 * perder los datos del negocio.
 */
export function SignUpConfirmedPage() {
  const { session, loading, refreshProfile } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [planRejected, setPlanRejected] = useState(false)
  const [planOverride, setPlanOverride] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  // Created: the organization's own address (ADR 0021), shown before entering.
  const [created, setCreated] = useState<{ orgName: string; orgCode: string; accountSlug: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const started = useRef(-1)
  const pending = pendingOrganizationOf(session?.user.user_metadata)
  const plan = planOverride ?? pendingPlanOf(session?.user.user_metadata)
  const fullName = session?.user.user_metadata?.full_name as string | undefined
  const pricing = usePublicPricing()

  useEffect(() => {
    if (!session || !pending || planRejected || started.current === attempt) return
    started.current = attempt
    createOrganization(pending, plan, fullName)
      .then(async (slug) => {
        clearSelectedPlan()
        await refreshProfile()
        await queryClient.invalidateQueries({ queryKey: MY_KITCHENS_KEY })
        const ctx = await fetchMyContext().catch(() => null)
        const account = ctx?.accounts.find((a) => a.slug === slug)
        const org = ctx?.organizations.find((o) => o.id === account?.organizationId)
        // With subdomains, show "your Quanela space" first; otherwise straight in, as before.
        if (org && tenantUrl(org.tenantCode)) setCreated({ orgName: org.name, orgCode: org.tenantCode, accountSlug: slug })
        else navigate(`${kitchenPath(slug, '/')}?bienvenida=1`, { replace: true })
      })
      .catch((err) => {
        const message = getErrorMessage(err, 'No se pudo preparar tu negocio')
        if (message.includes(PLAN_NOT_AVAILABLE)) setPlanRejected(true)
        else setError(message)
      })
  }, [session, pending, plan, planRejected, fullName, attempt, refreshProfile, queryClient, navigate])

  async function choosePlan(key: string) {
    setError(null)
    try {
      await updatePendingPlan(key)
    } catch {
      // No crítico: el plan viaja igual en esta llamada.
    }
    setPlanOverride(key)
    setPlanRejected(false)
    setAttempt((a) => a + 1)
  }

  if (loading) return <FullScreenLoading />
  // Sin sesión (enlace vencido o abierto en otro navegador): iniciar sesión termina el proceso.
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent('/registro/confirmado')}`} replace />
  if (created) {
    const url = tenantUrl(created.orgCode, `${kitchenPath(created.accountSlug, '/')}?bienvenida=1`)!
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-neutral-100">
        <div className="w-full max-w-md space-y-5 rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-6 text-center">
          <CheckCircle2 size={28} className="mx-auto text-emerald-400" aria-hidden />
          <div>
            <h1 className={typography.h2}>Tu organización ha sido creada</h1>
            <p className={`mt-1 ${typography.small}`}>{created.orgName} tiene su propia dirección. Guárdala: tu equipo entra por ahí.</p>
          </div>
          <p className="text-sm text-neutral-400">
            Código: <span className="font-mono text-base font-semibold tracking-widest text-neutral-50">{created.orgCode}</span>
          </p>
          <p className="text-xs text-neutral-500">Tu espacio Quanela:</p>
          <div className="flex items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5">
            <span className="truncate font-mono text-sm text-brasa-300">{tenantHostLabel(created.orgCode)}</span>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(`https://${tenantHostLabel(created.orgCode)}`).then(() => setCopied(true))}
              aria-label="Copiar la dirección"
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
            >
              <Copy size={14} aria-hidden />
            </button>
          </div>
          {copied && <p className="text-xs text-emerald-400">Dirección copiada.</p>}
          <Button variant="primary" size="lg" icon={ArrowRight} className="w-full" onClick={() => window.location.assign(url)}>
            Entrar a mi espacio
          </Button>
        </div>
      </div>
    )
  }
  if (!pending) return <Navigate to="/" replace />

  if (planRejected) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10 text-neutral-100">
        <div className="w-full max-w-5xl space-y-5 rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-6">
          <div>
            <h1 className={typography.h2}>Elige el plan para {pending.name}</h1>
            <p className={`mt-1 ${typography.small}`}>El plan que elegiste ya no está disponible. Tus datos están guardados: elige otro y terminamos.</p>
          </div>
          {pricing.data ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {pricing.data.plans.map((p) => (
                <PlanCard
                  key={p.key}
                  plan={p}
                  action={
                    p.selfServe ? (
                      <Button variant={p.badge ? 'primary' : 'secondary'} className="w-full" onClick={() => void choosePlan(p.key)}>
                        Elegir {p.name}
                      </Button>
                    ) : (
                      <a href={p.contactUrl ?? undefined} className="flex h-10 w-full items-center justify-center rounded-xl border border-neutral-700 text-sm font-semibold hover:bg-neutral-800/60">
                        {p.ctaLabel}
                      </a>
                    )
                  }
                />
              ))}
            </div>
          ) : (
            <Loader2 size={24} className="mx-auto animate-spin text-brasa-400" aria-hidden />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-neutral-100">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-6 text-center">
        {error ? (
          <>
            <p className="flex items-center justify-center gap-2 font-medium">
              <AlertTriangle size={16} className="text-amber-400" aria-hidden /> No pudimos terminar
            </p>
            <p className={typography.small}>{error}</p>
            <Button variant="primary" icon={RotateCw} className="w-full" onClick={() => { setError(null); setAttempt((a) => a + 1) }}>
              Intentar de nuevo
            </Button>
            <Link to="/login" className="block text-sm text-neutral-400 hover:text-neutral-200">
              Volver a iniciar sesión
            </Link>
          </>
        ) : (
          <>
            <Loader2 size={24} className="mx-auto animate-spin text-brasa-400" aria-hidden />
            <p className="font-medium">Preparando {pending.accountName ?? pending.name}…</p>
            <p className={typography.small}>Estamos creando tu organización, tu plan y tu primera cuenta.</p>
          </>
        )}
      </div>
    </div>
  )
}
