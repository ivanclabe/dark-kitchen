import { KitchenLink } from '@/shared/kitchen/KitchenLink'
import { Button, buttonClass } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { CurrencyInput } from '@/shared/ui/CurrencyInput'
import { FormField, FormGrid, Input } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatMoney } from '@/shared/utils/format'
import { whatsappLink } from '@/shared/utils/whatsapp'
import { AlertTriangle, Copy, Download, ExternalLink, Globe, MessageCircle, Palette, QrCode, Save, ShoppingBag } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { usePublicMenuPreview, useSavePublicMenuSettings } from '../hooks'
import { openLabel, publicMenuUrl, shareText } from '../lib/cart'
import { qrSvgDataUrl } from '../lib/qr'
import { resolveTheme, TEMPLATES } from '../lib/themes'
import type { PublicMenuSettings, PublicPaymentMethod } from '../types'

type Draft = Pick<
  PublicMenuSettings,
  'ordersEnabled' | 'delivery' | 'pickup' | 'deliveryFee' | 'minOrder' | 'paymentMethods' | 'transferInstructions' | 'autoConfirm' | 'message'
>

const METHODS: { value: PublicPaymentMethod; label: string }[] = [
  { value: 'Efectivo', label: 'Efectivo' },
  { value: 'Transferencia', label: 'Transferencia' },
  { value: 'Tarjeta', label: 'Tarjeta (datáfono)' },
]

function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-neutral-800/60 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-100">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

/**
 * Resumen (ADR 0052): publish state warnings, the link, the ordering options,
 * today on the page, the design in use and the QR (in the brand color, ADR 0053).
 */
export function SummaryTab({ settings, onEditDesign }: { settings: PublicMenuSettings; onEditDesign: () => void }) {
  const save = useSavePublicMenuSettings()
  const preview = usePublicMenuPreview(settings.slug, settings.published)
  const { show } = useToast()
  const [draft, setDraft] = useState<Draft>({
    ordersEnabled: settings.ordersEnabled,
    delivery: settings.delivery,
    pickup: settings.pickup,
    deliveryFee: settings.deliveryFee,
    minOrder: settings.minOrder,
    paymentMethods: settings.paymentMethods,
    transferInstructions: settings.transferInstructions,
    autoConfirm: settings.autoConfirm,
    message: settings.message,
  })
  const url = publicMenuUrl(settings.slug)
  const theme = resolveTheme(settings.theme)
  const qr = useMemo(() => qrSvgDataUrl(url, theme.colors.primary), [url, theme.colors.primary])
  const open = openLabel(settings.openState)
  const dirty = JSON.stringify(draft) !== JSON.stringify({
    ordersEnabled: settings.ordersEnabled, delivery: settings.delivery, pickup: settings.pickup, deliveryFee: settings.deliveryFee, minOrder: settings.minOrder,
    paymentMethods: settings.paymentMethods, transferInstructions: settings.transferInstructions, autoConfirm: settings.autoConfirm, message: settings.message,
  })
  const items = preview.data?.items ?? []
  const availableNow = items.filter((i) => i.availability === 'available').length
  const message = preview.data ? shareText(preview.data, url) : `🍽️ Mira el menú de hoy de ${settings.name} y pide aquí: ${url}`

  async function saveOptions() {
    try {
      await save.mutateAsync(draft)
      show('Opciones guardadas.')
    } catch (err) {
      show(getErrorMessage(err, 'No se pudieron guardar las opciones'), 'error')
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      show('Enlace copiado.')
    } catch {
      show('No se pudo copiar. Selecciona el enlace y cópialo.', 'error')
    }
  }

  const warnings: ReactNode[] = []
  if (!settings.whatsapp)
    warnings.push(
      <>
        No hay número de WhatsApp: los clientes no podrán escribirte desde el menú.{' '}
        <KitchenLink to="/consumer/perfil" className="underline">Agrégalo en Consumer → Perfil del negocio</KitchenLink>.
      </>,
    )
  if (!settings.hasHours)
    warnings.push(
      <>
        No hay horario de la cocina: la página no dice si estás abierto y recibe pedidos a toda hora.{' '}
        <KitchenLink to="/operations?view=kitchen" className="underline">Configúralo en Cocina</KitchenLink>.
      </>,
    )
  if (settings.published && preview.data && items.length === 0)
    warnings.push(
      <>
        Hoy no hay platos en el planificador: la página dice «Hoy no hay menú publicado».{' '}
        <KitchenLink to="/menu-planner" className="underline">Arma el menú de hoy</KitchenLink>.
      </>,
    )

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <ul className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
          {warnings.map((w, i) => (
            <li key={i} className="flex gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <Card title="Tu enlace" icon={Globe} description="Compártelo por WhatsApp, en tus redes o imprímelo con el QR.">
            <div className="space-y-3">
              <p className="rounded-lg bg-neutral-900 px-3 py-2.5 font-mono text-sm break-all text-neutral-100">{url}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" icon={Copy} onClick={() => void copy()}>
                  Copiar
                </Button>
                <a href={whatsappLink(null, message)} target="_blank" rel="noreferrer" className={`${buttonClass({ variant: 'primary', size: 'sm' })} inline-flex items-center gap-1.5`}>
                  <MessageCircle size={14} aria-hidden /> Compartir por WhatsApp
                </a>
                <a href={url} target="_blank" rel="noreferrer" className={`${buttonClass({ variant: 'secondary', size: 'sm' })} inline-flex items-center gap-1.5`}>
                  <ExternalLink size={14} aria-hidden /> Ver la página
                </a>
              </div>
              <p className="text-xs text-neutral-500">
                La dirección es el identificador de la cuenta ({settings.slug}). Si lo cambias en Configuración → General, el enlace cambia y los que ya compartiste dejan de funcionar.
              </p>
              {!settings.published && <p className="text-xs text-amber-400">Mientras no publiques, el enlace dice «Este menú no está disponible».</p>}
            </div>
          </Card>

          <Card title="Pedidos" icon={ShoppingBag} description="Lo que se pide aquí llega como un pedido del canal «Menú web».">
            <div className="space-y-3">
              <Row title="Recibir pedidos" hint="Apagado: el menú se ve y el cliente arma su pedido para enviártelo por WhatsApp.">
                <Switch checked={draft.ordersEnabled} onChange={(v) => setDraft((d) => ({ ...d, ordersEnabled: v }))} label="Recibir pedidos" />
              </Row>
              <Row
                title="Confirmar automáticamente"
                hint="Encendido: el pedido entra a Cocina al instante, con la misma confirmación de siempre (receta, stock y comanda). Si algo falla, queda en Por confirmar. Apagado: todos llegan a Por confirmar."
              >
                <Switch checked={draft.autoConfirm} onChange={(v) => setDraft((d) => ({ ...d, autoConfirm: v }))} label="Confirmar automáticamente" />
              </Row>
              <Row title="Domicilio">
                <Switch checked={draft.delivery} onChange={(v) => setDraft((d) => ({ ...d, delivery: v, pickup: v ? d.pickup : true }))} label="Domicilio" />
              </Row>
              <Row title="Recoger en el local">
                <Switch checked={draft.pickup} onChange={(v) => setDraft((d) => ({ ...d, pickup: v, delivery: v ? d.delivery : true }))} label="Recoger en el local" />
              </Row>
              <FormGrid>
                {draft.delivery && (
                  <FormField label="Costo del domicilio">
                    {(a11y) => <CurrencyInput {...a11y} value={draft.deliveryFee} onValueChange={(v) => setDraft((d) => ({ ...d, deliveryFee: v ?? 0 }))} />}
                  </FormField>
                )}
                <FormField label="Pedido mínimo" hint="0 = sin mínimo">
                  {(a11y) => <CurrencyInput {...a11y} value={draft.minOrder} onValueChange={(v) => setDraft((d) => ({ ...d, minOrder: v ?? 0 }))} />}
                </FormField>
              </FormGrid>
              <fieldset>
                <legend className="text-sm font-medium text-neutral-200">Formas de pago</legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  {METHODS.map((m) => (
                    <label key={m.value} className="flex items-center gap-2 text-sm text-neutral-300">
                      <input
                        type="checkbox"
                        className="accent-brasa-500"
                        checked={draft.paymentMethods.includes(m.value)}
                        onChange={(e) =>
                          setDraft((d) => {
                            const next = e.target.checked ? [...d.paymentMethods, m.value] : d.paymentMethods.filter((x) => x !== m.value)
                            return { ...d, paymentMethods: next.length ? next : d.paymentMethods }
                          })
                        }
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {draft.paymentMethods.includes('Transferencia') && (
                <FormField label="Instrucciones de transferencia" hint="Se muestran al cliente al pedir y en su seguimiento.">
                  {(a11y) => (
                    <Input {...a11y} value={draft.transferInstructions ?? ''} onChange={(e) => setDraft((d) => ({ ...d, transferInstructions: e.target.value }))} placeholder="Nequi 300 123 4567 a nombre de…" maxLength={300} />
                  )}
                </FormField>
              )}
              <FormField label="Mensaje para tus clientes" hint="Opcional. Sale arriba del menú.">
                {(a11y) => <Input {...a11y} value={draft.message ?? ''} onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))} placeholder="Hoy domicilios gratis en el barrio" maxLength={200} />}
              </FormField>
              <div className="flex justify-end">
                <Button variant="primary" icon={Save} onClick={() => void saveOptions()} loading={save.isPending} disabled={!dirty}>
                  Guardar opciones
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Hoy en tu página">
            {!settings.published ? (
              <p className="text-sm text-neutral-400">Publica el menú para ver aquí lo que ven tus clientes.</p>
            ) : preview.isLoading ? (
              <LoadingState variant="inline" label="Cargando…" />
            ) : (
              <div className="space-y-2 text-sm">
                {open.text && <p className={open.open ? 'text-emerald-400' : 'text-red-400'}>{open.text}</p>}
                <p className="text-neutral-300">
                  {items.length} plato(s) del planificador · {availableNow} disponible(s) ahora
                </p>
                <ul className="space-y-1">
                  {items.slice(0, 8).map((i) => (
                    <li key={i.id} className="flex justify-between gap-3 text-neutral-400">
                      <span className="truncate">{i.name}</span>
                      <span className="tabular-nums">{formatMoney(i.price)}</span>
                    </li>
                  ))}
                </ul>
                <KitchenLink to="/menu-planner" className="inline-block text-xs text-brasa-400 hover:underline">
                  Cambiar el menú de hoy en el planificador
                </KitchenLink>
              </div>
            )}
          </Card>
          <Card title="Diseño" icon={Palette} description="Cómo se ve tu página: plantilla, colores, letra y platos.">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-neutral-300">
                <span className="flex -space-x-1" aria-hidden>
                  {[theme.colors.background, theme.colors.primary, theme.colors.text].map((c, i) => (
                    <span key={i} className="size-4 rounded-full ring-1 ring-neutral-700" style={{ background: c }} />
                  ))}
                </span>
                {settings.theme ? `Plantilla ${TEMPLATES[theme.template].name}` : 'Diseño básico'}
              </div>
              <Button size="sm" variant="secondary" icon={Palette} onClick={onEditDesign}>
                Editar diseño
              </Button>
            </div>
          </Card>
          <Card title="Código QR" icon={QrCode} description="Para la mesa, la vitrina o los empaques.">
            <div className="flex flex-col items-center gap-3">
              <img src={qr} alt={`Código QR de ${url}`} className="size-48 rounded-xl bg-white p-2" />
              <a href={qr} download={`menu-${settings.slug}.svg`} className={`${buttonClass({ variant: 'secondary', size: 'sm' })} inline-flex items-center gap-1.5`}>
                <Download size={14} aria-hidden /> Descargar
              </a>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
