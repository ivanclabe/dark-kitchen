import { CATEGORIES, COUNTRIES, SECTORS } from '@/modules/organization/lib/business'
import { Button } from '@/shared/ui/Button'
import { FormActions, FormField, FormGrid, Input, Select } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlertTriangle, Building2, Check, CheckCircle2, Copy, MailWarning, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageTitle, Panel, StatusPill } from '../components/ui'
import { checkNewOrganization, createOrganization, fetchPlans, type CreatedOrganization, type NewOrganizationCheck, type NewOrganizationInput } from '../lib/api'
import { EMPTY_ORGANIZATION as EMPTY, validateStep } from '../lib/createOrganization'
import { formatDateTimeShort } from '../lib/format'

type Step = 'business' | 'admin' | 'review' | 'done'

const STEPS: { key: Exclude<Step, 'done'>; label: string }[] = [
  { key: 'business', label: 'Organización' },
  { key: 'admin', label: 'Administrador' },
  { key: 'review', label: 'Revisión' },
]

/**
 * Create an organization from the portal (ADR 0019): the same provisioning as
 * the public signup (dk_provision_organization), plus an invitation to its
 * Organization Admin, who sets their own password when activating. The
 * portal never sees or sets a password.
 */
export function CreateOrganizationPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { show } = useToast()
  const [step, setStep] = useState<Step>('business')
  const [form, setForm] = useState<NewOrganizationInput>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof NewOrganizationInput, string>>>({})
  const [check, setCheck] = useState<NewOrganizationCheck | null>(null)
  const [confirmSimilar, setConfirmSimilar] = useState(false)
  const [result, setResult] = useState<CreatedOrganization | null>(null)
  const plans = useQuery({ queryKey: ['ga', 'plans'], queryFn: fetchPlans })

  const set = <K extends keyof NewOrganizationInput>(key: K, value: NewOrganizationInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const review = useMutation({
    mutationFn: () => checkNewOrganization(form.name.trim(), form.adminEmail.trim(), form.taxId?.trim() || null),
    onSuccess: (c) => {
      setCheck(c)
      setConfirmSimilar(false)
      setStep('review')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo revisar la información'), 'error'),
  })

  const create = useMutation({
    mutationFn: () =>
      createOrganization({
        ...form,
        name: form.name.trim(),
        adminName: form.adminName.trim(),
        adminEmail: form.adminEmail.trim().toLowerCase(),
        city: form.city?.trim() || null,
        phone: form.phone?.trim() || null,
        taxId: form.taxId?.trim() || null,
        confirmSimilar,
      }),
    onSuccess: async (r) => {
      setResult(r)
      setStep('done')
      await queryClient.invalidateQueries({ queryKey: ['ga'] })
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo crear la organización').replace(/^SIMILAR_ORGANIZATION:\s*/, ''), 'error'),
  })

  function next(from: 'business' | 'admin') {
    const found = validateStep(from, form)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    if (from === 'business') setStep('admin')
    else review.mutate()
  }

  function restart() {
    setForm(EMPTY)
    setErrors({})
    setCheck(null)
    setConfirmSimilar(false)
    setResult(null)
    setStep('business')
  }

  const blocked = Boolean(check && (!check.emailValid || check.user.ownsOrganization || (check.user.exists && !check.user.active)))
  const needsConfirm = Boolean(check && check.similarOrganizations.length > 0)
  const planName = plans.data?.find((p) => p.key === form.plan)?.name ?? form.plan

  return (
    <>
      <PageTitle
        backTo={{ to: '/organizations', label: 'Organizations' }}
        title="Crear organización"
        icon={Building2}
        description="Se crea igual que en el registro público y su administrador recibe una invitación para activar la cuenta."
      />

      {step !== 'done' && (
        <ol className="mb-5 flex flex-wrap items-center gap-2 text-xs" aria-label="Pasos">
          {STEPS.map((s, i) => {
            const index = STEPS.findIndex((x) => x.key === step)
            const state = i < index ? 'done' : i === index ? 'current' : 'next'
            return (
              <li key={s.key} className="flex items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
                <span
                  className={clsx(
                    'inline-flex size-6 items-center justify-center rounded-full font-semibold',
                    state === 'done' ? 'bg-emerald-500/15 text-emerald-300' : state === 'current' ? 'bg-brasa-500 text-white' : 'bg-console-800 text-neutral-500',
                  )}
                >
                  {state === 'done' ? <Check size={12} aria-hidden /> : i + 1}
                </span>
                <span className={state === 'current' ? 'text-neutral-100' : 'text-neutral-500'}>{s.label}</span>
                {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-console-700" aria-hidden />}
              </li>
            )
          })}
        </ol>
      )}

      {step === 'business' && (
        <Panel title="Datos de la organización" className="max-w-3xl">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              next('business')
            }}
            noValidate
          >
            <FormGrid>
              <FormField label="Nombre del negocio" required error={errors.name} className="sm:col-span-2">
                {(p) => <Input {...p} value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={80} autoFocus />}
              </FormField>
              <FormField label="Sector" required error={errors.sector}>
                {(p) => (
                  <Select {...p} value={form.sector} onChange={(e) => set('sector', e.target.value)}>
                    <option value="">Elige…</option>
                    {SECTORS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <FormField label="Categoría" required error={errors.category}>
                {(p) => (
                  <Select {...p} value={form.category} onChange={(e) => set('category', e.target.value)}>
                    <option value="">Elige…</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <FormField label="Plan" required error={errors.plan} hint={plans.isError ? 'No se pudieron cargar los planes' : undefined}>
                {(p) => (
                  <Select {...p} value={form.plan} onChange={(e) => set('plan', e.target.value)} disabled={plans.isLoading}>
                    <option value="">{plans.isLoading ? 'Cargando…' : 'Elige…'}</option>
                    {plans.data?.map((pl) => (
                      <option key={pl.key} value={pl.key}>
                        {pl.name}
                        {pl.trialDays > 0 ? ` (prueba de ${pl.trialDays} días)` : ''}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <FormField label="País" required error={errors.country}>
                {(p) => (
                  <Select {...p} value={form.country} onChange={(e) => set('country', e.target.value)}>
                    {COUNTRIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <FormField label="Ciudad">{(p) => <Input {...p} value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} maxLength={80} />}</FormField>
              <FormField label="Teléfono">{(p) => <Input {...p} type="tel" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} maxLength={30} />}</FormField>
              <FormField label="NIT" hint="Opcional. Ayuda a detectar organizaciones repetidas.">
                {(p) => <Input {...p} value={form.taxId ?? ''} onChange={(e) => set('taxId', e.target.value)} maxLength={30} />}
              </FormField>
            </FormGrid>
            <FormActions>
              <Button variant="ghost" onClick={() => navigate('/organizations')}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary">
                Siguiente
              </Button>
            </FormActions>
          </form>
        </Panel>
      )}

      {step === 'admin' && (
        <Panel title="Organization Admin" subtitle="La persona que administrará la organización. Recibirá un correo para activar su cuenta y crear su propia contraseña." className="max-w-3xl">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              next('admin')
            }}
            noValidate
          >
            <FormGrid>
              <FormField label="Nombre completo" required error={errors.adminName}>
                {(p) => <Input {...p} value={form.adminName} onChange={(e) => set('adminName', e.target.value)} maxLength={80} autoFocus autoComplete="off" />}
              </FormField>
              <FormField label="Correo" required error={errors.adminEmail}>
                {(p) => <Input {...p} type="email" value={form.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} maxLength={254} autoComplete="off" />}
              </FormField>
            </FormGrid>
            <FormActions>
              <Button variant="ghost" onClick={() => setStep('business')}>
                Atrás
              </Button>
              <Button type="submit" variant="primary" loading={review.isPending}>
                Revisar
              </Button>
            </FormActions>
          </form>
        </Panel>
      )}

      {step === 'review' && check && (
        <div className="max-w-3xl space-y-4">
          {check.user.ownsOrganization && (
            <Notice tone="bad" title="Ese correo ya administra una organización">
              {check.user.ownsOrganization}. Una persona solo puede ser dueña de una organización; usa otro correo.
            </Notice>
          )}
          {check.user.exists && !check.user.active && <Notice tone="bad" title="Ese usuario está desactivado en Quanela">Usa otro correo.</Notice>}
          {!check.emailValid && <Notice tone="bad" title="El correo no es válido">Revísalo en el paso anterior.</Notice>}
          {check.user.exists && check.user.active && !check.user.ownsOrganization && (
            <Notice tone="info" title="Ya tiene usuario en Quanela">
              {check.user.fullName ?? form.adminEmail} {check.user.hasLogin ? 'ya puede iniciar sesión: recibirá un enlace para entrar y activar la organización.' : 'todavía no activa su acceso: recibirá la invitación.'}
            </Notice>
          )}
          {needsConfirm && (
            <Notice tone="warn" title="Hay organizaciones parecidas">
              <ul className="mt-1 list-disc pl-4">
                {check.similarOrganizations.map((o) => (
                  <li key={o.id}>
                    {o.name}
                    {o.taxId ? ` · NIT ${o.taxId}` : ''} {!o.active && '(inactiva)'}
                  </li>
                ))}
              </ul>
              <label className="mt-2 flex items-center gap-2 text-neutral-200">
                <input type="checkbox" checked={confirmSimilar} onChange={(e) => setConfirmSimilar(e.target.checked)} className="accent-brasa-500" />
                Es otra organización: crearla de todas formas
              </label>
            </Notice>
          )}

          <Panel title="Revisión">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Row label="Organización" value={form.name.trim()} />
              <Row label="Plan" value={planName} />
              <Row label="Sector" value={SECTORS.find((s) => s.value === form.sector)?.label} />
              <Row label="Categoría" value={CATEGORIES.find((c) => c.value === form.category)?.label} />
              <Row label="Ubicación" value={[form.city?.trim(), COUNTRIES.find((c) => c.value === form.country)?.label].filter(Boolean).join(', ')} />
              <Row label="NIT" value={form.taxId?.trim()} />
              <Row label="Administrador" value={form.adminName.trim()} />
              <Row label="Correo" value={form.adminEmail.trim().toLowerCase()} />
            </dl>
            <FormActions>
              <Button variant="ghost" onClick={() => setStep('admin')} disabled={create.isPending}>
                Atrás
              </Button>
              <Button variant="primary" onClick={() => create.mutate()} loading={create.isPending} disabled={blocked || (needsConfirm && !confirmSimilar)}>
                Crear organización
              </Button>
            </FormActions>
          </Panel>
        </div>
      )}

      {step === 'done' && result && <Result result={result} planName={planName} onAnother={restart} onOpen={() => navigate(`/organizations/${result.organizationId}`)} />}
    </>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-console-800 py-1.5">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="min-w-0 truncate text-right text-neutral-200">{value || '—'}</dd>
    </div>
  )
}

function Notice({ tone, title, children }: { tone: 'bad' | 'warn' | 'info'; title: string; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : undefined}
      className={clsx(
        'flex gap-3 rounded-xl border p-3 text-xs',
        tone === 'bad' ? 'border-red-500/30 bg-red-500/5 text-red-200' : tone === 'warn' ? 'border-amber-500/30 bg-amber-500/5 text-amber-100' : 'border-console-700 bg-console-900 text-neutral-300',
      )}
    >
      {tone === 'info' ? <UserRound size={16} className="shrink-0 text-neutral-400" aria-hidden /> : <AlertTriangle size={16} className="shrink-0" aria-hidden />}
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  )
}

function Result({ result, planName, onAnother, onOpen }: { result: CreatedOrganization; planName: string; onAnother: () => void; onOpen: () => void }) {
  const { show } = useToast()
  const inv = result.invitation
  return (
    <Panel className="max-w-3xl">
      <div className="flex items-start gap-3">
        <CheckCircle2 size={22} className="shrink-0 text-emerald-400" aria-hidden />
        <div>
          <h2 className="text-base font-semibold text-neutral-50">Organización creada</h2>
          <p className="text-sm text-neutral-400">Queda pendiente de activación hasta que su administrador entre por primera vez.</p>
        </div>
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Row label="Plan" value={planName} />
        <Row label="Creada" value={formatDateTimeShort(result.createdAt)} />
        <Row label="Administrador" value={result.adminName} />
        <Row label="Correo" value={result.adminEmail} />
        <div className="flex items-center justify-between gap-4 border-b border-console-800 py-1.5">
          <dt className="text-neutral-500">Estado</dt>
          <dd>
            <StatusPill tone="warn">Pendiente de activación</StatusPill>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-console-800 py-1.5">
          <dt className="text-neutral-500">Invitación</dt>
          <dd>
            {inv.sent ? <StatusPill tone="good">{inv.method === 'invite' ? 'Enviada' : 'Enlace de acceso enviado'}</StatusPill> : <StatusPill tone="bad">No enviada</StatusPill>}
          </dd>
        </div>
      </dl>
      {!inv.sent && inv.activationUrl && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100">
          <p className="flex items-center gap-2 font-semibold">
            <MailWarning size={14} aria-hidden /> No se pudo enviar el correo{inv.detail ? `: ${inv.detail}` : ''}
          </p>
          <p className="mt-1">Compártelo con el administrador por un canal privado (WhatsApp, por ejemplo). Es de un solo uso, lo deja entrar directo para crear su contraseña y vence en poco tiempo (1 hora, por defecto); si vence, usa «Reenviar invitación».</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 break-all font-mono text-amber-200">{inv.activationUrl}</span>
            <Button size="sm" variant="secondary" icon={Copy} onClick={() => void navigator.clipboard.writeText(inv.activationUrl ?? '').then(() => show('Enlace copiado.'))}>
              Copiar enlace
            </Button>
          </div>
        </div>
      )}
      <FormActions>
        <Button variant="ghost" onClick={onAnother}>
          Crear otra
        </Button>
        <Button variant="primary" onClick={onOpen}>
          Ver organización
        </Button>
      </FormActions>
    </Panel>
  )
}
