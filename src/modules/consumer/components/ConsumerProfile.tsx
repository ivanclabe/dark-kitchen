import { KitchenLink } from '@/shared/kitchen/KitchenLink'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { FormField, FormGrid, Input } from '@/shared/ui/FormField'
import { PhoneInput } from '@/shared/ui/PhoneInput'
import { SaveBar } from '@/shared/ui/SaveBar'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { phoneError } from '@/shared/utils/phone'
import clsx from 'clsx'
import { ArrowRight, BarChart3, ExternalLink, IdCard, LocateFixed, MapPin } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { StorefrontData, StorefrontState } from '../api/storefront'
import { useSaveStorefront } from '../hooks/useStorefront'
import { cuisineLabel, sharedTimes } from '../lib/readiness'

function initialForm(state: StorefrontState): StorefrontData {
  const s = state.storefront
  return {
    published: s?.published ?? false,
    tagline: s?.tagline ?? '',
    latitude: s?.latitude ?? null,
    longitude: s?.longitude ?? null,
    whatsapp_phone: s?.whatsapp_phone ?? '',
    share_metrics: s?.share_metrics ?? false,
  }
}

/** An inherited value: shown, not edited here. */
function Inherited({ label, value, muted }: { label: string; value: string; muted?: string }) {
  return (
    <div className="min-w-0">
      <dt className={typography.label}>{label}</dt>
      <dd className="mt-1.5 truncate text-sm text-neutral-100">
        {value}
        {muted && <span className="ml-1.5 text-neutral-500">{muted}</span>}
      </dd>
    </div>
  )
}

/**
 * Perfil del negocio (ADR 0046, D4): how this account appears in Quanela
 * Consumer, in three cards — identity, contact and location, and what it
 * shares. Publishing is not here (Resumen): saving the profile keeps the
 * publication as it is.
 *
 * ADR 0047: the identity is the account's — its name, its identifier (the
 * public address) and its cuisine, set in Configuración → General. Here
 * they are shown, not copied; only the short phrase is Consumer's own.
 */
export function ConsumerProfile({ state }: { state: StorefrontState }) {
  const { show } = useToast()
  const save = useSaveStorefront()
  const initial = useMemo(() => initialForm(state), [state])
  const [form, setForm] = useState(initial)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [locating, setLocating] = useState(false)

  const set = <K extends keyof StorefrontData>(key: K, value: StorefrontData[K]) => setForm((f) => ({ ...f, [key]: value }))
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const account = state.account
  const cuisine = cuisineLabel(account.cuisine ?? account.organization_cuisine)
  const waError = form.whatsapp_phone ? phoneError(form.whatsapp_phone) : null
  const times = sharedTimes(state.metrics)

  function submit() {
    save.mutate(
      { ...form, tagline: form.tagline || null, whatsapp_phone: form.whatsapp_phone || null },
      {
        onSuccess: () => {
          setSavedAt(Date.now())
          show(form.published ? 'Guardado: los cambios ya se ven en Quanela Consumer.' : 'Perfil guardado.')
        },
      },
    )
  }

  function locate() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, latitude: Number(pos.coords.latitude.toFixed(6)), longitude: Number(pos.coords.longitude.toFixed(6)) }))
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  return (
    <form
      className="max-w-3xl space-y-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!waError) submit()
      }}
    >
      <Card
        title="Identidad"
        icon={IdCard}
        description="Es la de tu cuenta: el nombre, el identificador y el tipo de cocina de Configuración → General."
        action={
          <KitchenLink to="/settings/general" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brasa-400 hover:text-brasa-300">
            Cambiar en General <ArrowRight size={12} aria-hidden />
          </KitchenLink>
        }
      >
        <dl className="grid gap-4 sm:grid-cols-3">
          <Inherited label="Nombre" value={account.name} />
          <Inherited label="Dirección pública" value={account.slug} />
          <Inherited label="Tipo de cocina" value={cuisine ?? 'Sin definir'} muted={account.cuisine === null && cuisine ? '(como el negocio)' : undefined} />
        </dl>
        <div className="mt-5 border-t border-neutral-800/60 pt-5">
          <FormField label="Frase corta" hint={`Solo para Quanela Consumer · ${(form.tagline ?? '').length} de 140`}>
            {(a11y) => <Input {...a11y} value={form.tagline ?? ''} maxLength={140} placeholder="Smash burgers a la plancha" onChange={(e) => set('tagline', e.target.value)} className="sm:max-w-md" />}
          </FormField>
        </div>
      </Card>

      <Card title="Contacto y ubicación" icon={MapPin} description="Para que el cliente te pida y sepa a qué distancia estás.">
        <FormGrid>
          <FormField label="WhatsApp para pedidos" hint="Opcional. El cliente te envía su pedido por WhatsApp desde Quanela." error={waError}>
            {(a11y) => <PhoneInput {...a11y} value={form.whatsapp_phone ?? ''} onValueChange={(v) => set('whatsapp_phone', v)} />}
          </FormField>
          <FormField label="Ubicación" hint={form.latitude != null ? `${form.latitude}, ${form.longitude}` : 'Sin ubicación, Quanela no puede decir a qué distancia estás.'}>
            {() => (
              <div className="flex flex-wrap gap-2">
                <Button icon={LocateFixed} loading={locating} onClick={locate}>
                  {form.latitude != null ? 'Actualizar' : 'Usar mi ubicación actual'}
                </Button>
                {form.latitude != null && (
                  <>
                    <a
                      href={`https://www.google.com/maps?q=${form.latitude},${form.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
                    >
                      Ver en el mapa <ExternalLink size={13} aria-hidden />
                    </a>
                    <Button variant="ghost" onClick={() => setForm((f) => ({ ...f, latitude: null, longitude: null }))}>
                      Quitar
                    </Button>
                  </>
                )}
              </div>
            )}
          </FormField>
        </FormGrid>
      </Card>

      <Card title="Datos que compartes" icon={BarChart3} description="Ayudan a que Quanela te recomiende. Nunca ventas, costos ni datos de tus clientes.">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-100">Compartir tiempos y cumplimiento</p>
            <p className={clsx('mt-0.5', typography.caption)}>Medianas de tus pedidos reales de los últimos 30 días: preparación, confirmación, domicilio, pedidos cumplidos y qué platos se piden más.</p>
            <p className="mt-2 rounded-lg bg-neutral-900 px-3 py-2 text-xs text-neutral-300">
              {times ? `Hoy se compartiría: ${times}.` : 'Aún no hay suficientes pedidos (se necesitan 10 en 30 días): por ahora no se mostraría ningún tiempo.'}
            </p>
          </div>
          <Switch checked={form.share_metrics} onChange={(v) => set('share_metrics', v)} label="Compartir tiempos y cumplimiento" />
        </div>
      </Card>

      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        savedAt={savedAt}
        error={save.error ? getErrorMessage(save.error, 'No se pudo guardar') : null}
        invalid={Boolean(waError)}
        onDiscard={() => setForm(initial)}
      />
    </form>
  )
}
