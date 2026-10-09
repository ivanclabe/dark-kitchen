import { ProductThumb } from '@/modules/products/components/ProductImage'
import { KitchenLink } from '@/shared/kitchen/KitchenLink'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { KpiStrip, type Kpi } from '@/shared/ui/KpiStrip'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { Tooltip } from '@/shared/ui/Tooltip'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate, formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { ArrowRight, CheckCircle2, Circle, Clock, Info, ListChecks, MapPin, Pause, Rocket, Smartphone } from 'lucide-react'
import { useState } from 'react'
import type { StorefrontData, StorefrontState } from '../api/storefront'
import { useSaveStorefront } from '../hooks/useStorefront'
import { cuisineLabel, dishFigures, readinessOf, sharedTimes, tagLabel, type ConsumerSection, type ReadinessItem } from '../lib/readiness'

/** ADR 0046 (D6): until the customers' app is out, the page says so (switch it on at launch). */
const APP_LIVE = import.meta.env.VITE_CONSUMER_APP_LIVE === 'true'

/** What Consumer saves of its own (ADR 0047: name, address and cuisine are the account's). */
function dataOf(s: NonNullable<StorefrontState['storefront']>): StorefrontData {
  return {
    published: s.published,
    tagline: s.tagline,
    latitude: s.latitude,
    longitude: s.longitude,
    whatsapp_phone: s.whatsapp_phone,
    share_metrics: s.share_metrics,
  }
}

function ReadinessRow({ item, onGoTo }: { item: ReadinessItem; onGoTo: (section: ConsumerSection) => void }) {
  const Icon = item.done ? CheckCircle2 : Circle
  const fix = !item.done && ('section' in item.fix ? (
    <button type="button" onClick={() => onGoTo((item.fix as { section: ConsumerSection }).section)} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brasa-400 hover:text-brasa-300">
      Completar <ArrowRight size={12} aria-hidden />
    </button>
  ) : (
    <KitchenLink to={item.fix.path} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brasa-400 hover:text-brasa-300">
      Configurar <ArrowRight size={12} aria-hidden />
    </KitchenLink>
  ))
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon size={17} className={clsx('mt-0.5 shrink-0', item.done ? 'text-emerald-400' : item.required ? 'text-amber-400' : 'text-neutral-600')} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm text-neutral-100">
          {item.label}
          {item.required && !item.done && (
            <Badge size="sm" tone="warning">
              Obligatorio
            </Badge>
          )}
        </p>
        <p className={clsx('mt-0.5', typography.caption)}>{item.detail}</p>
      </div>
      {fix}
    </li>
  )
}

/** How a customer sees the business and one dish (the same data the app reads). */
function Preview({ state }: { state: StorefrontState }) {
  const s = state.storefront
  const name = s?.display_name ?? state.defaults.display_name
  const cuisine = cuisineLabel(s?.cuisine ?? state.defaults.cuisine)
  const open = state.open_state?.state
  const times = s?.share_metrics ? sharedTimes(state.metrics) : null
  const dish = state.products.find((p) => p.published && p.image_path) ?? state.products.find((p) => p.published)
  return (
    <Card title="Cómo te ven los clientes" icon={Smartphone} description="Una vista previa con tus datos reales.">
      <div className="mx-auto max-w-sm space-y-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-neutral-50">{name}</p>
            <p className="truncate text-xs text-neutral-400">{[cuisine, s?.tagline].filter(Boolean).join(' · ') || 'Sin tipo de cocina ni frase'}</p>
          </div>
          {open === 'open' ? (
            <Badge size="sm" tone="success" dot>
              Abierto
            </Badge>
          ) : open === 'closed' ? (
            <Badge size="sm" tone="neutral" dot>
              Cerrado
            </Badge>
          ) : (
            <Badge size="sm" tone="warning">
              Sin horario
            </Badge>
          )}
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
          {times ? (
            <span className="inline-flex items-center gap-1">
              <Clock size={12} aria-hidden /> {times}
            </span>
          ) : (
            <span>Sin tiempos compartidos</span>
          )}
          {s?.latitude != null && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} aria-hidden /> Con ubicación
            </span>
          )}
        </p>
        {dish ? (
          <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-2.5">
            <ProductThumb name={dish.name} path={dish.image_path} toneSeed={dish.category} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-100">{dish.name}</p>
              <p className="text-xs text-neutral-400 tabular-nums">{formatMoney(dish.price)}</p>
              {dish.dietary_tags.length > 0 && <p className="truncate text-[11px] text-brasa-300">{dish.dietary_tags.map(tagLabel).join(' · ')}</p>}
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-neutral-800 p-3 text-center text-xs text-neutral-500">Aquí aparecerán tus platos publicados.</p>
        )}
      </div>
    </Card>
  )
}

/**
 * Resumen (ADR 0046, D3): whether customers see the business, the one action
 * (publish / pause), what is missing to be ready — each with where to fix
 * it — how they see it, and the figures of the published dishes. Everything
 * from dk_storefront_get: no visits, searches or ratings (they are not measured).
 */
export function ConsumerOverview({ state, onGoTo }: { state: StorefrontState; onGoTo: (section: ConsumerSection) => void }) {
  const { show } = useToast()
  const save = useSaveStorefront()
  const [confirming, setConfirming] = useState(false)
  const readiness = readinessOf(state)
  const dishes = dishFigures(state.products)
  const s = state.storefront
  const published = s?.published ?? false

  function setPublished(next: boolean) {
    if (!s) return
    save.mutate(
      { ...dataOf(s), published: next },
      {
        onSuccess: () => {
          setConfirming(false)
          show(next ? 'Publicado en Quanela Consumer.' : 'Publicación pausada: ningún cliente ve esta cuenta.')
        },
        onError: (err) => show(getErrorMessage(err, 'No se pudo guardar'), 'error'),
      },
    )
  }

  const kpis: Kpi[] = [
    { id: 'published', label: 'Platos publicados', value: `${dishes.published} de ${dishes.active}`, change: null, goodWhen: 'neutral', onSelect: () => onGoTo('platos') },
    { id: 'photo', label: 'Con foto', value: `${dishes.withPhoto} de ${dishes.published}`, change: null, goodWhen: 'neutral', hint: 'De los publicados' },
    { id: 'description', label: 'Con descripción', value: `${dishes.withDescription} de ${dishes.published}`, change: null, goodWhen: 'neutral', hint: 'De los publicados' },
    { id: 'tags', label: 'Con etiquetas', value: `${dishes.withTags} de ${dishes.published}`, change: null, goodWhen: 'neutral', hint: 'Vegetariano, sin gluten…' },
  ]

  const action = !s ? (
    <Button variant="primary" onClick={() => onGoTo('platos')}>
      Elegir platos
    </Button>
  ) : published ? (
    <Button icon={Pause} loading={save.isPending} onClick={() => setPublished(false)}>
      Pausar publicación
    </Button>
  ) : readiness.canPublish ? (
    <Button variant="primary" icon={Rocket} onClick={() => setConfirming(true)}>
      Publicar
    </Button>
  ) : (
    <Tooltip label="Falta lo obligatorio: el perfil y al menos un plato" side="top-end">
      <Button variant="primary" icon={Rocket} disabled>
        Publicar
      </Button>
    </Tooltip>
  )

  return (
    <div className="space-y-6">
      {!APP_LIVE && (
        <p role="note" className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-sm text-sky-200">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
          La app para clientes todavía no está disponible. Lo que prepares aquí quedará listo para el lanzamiento.
        </p>
      )}

      <section aria-label="Estado de la publicación" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={typography.h2}>{published ? 'Publicado' : 'No publicado'}</h2>
            <Badge tone={published ? 'success' : 'neutral'} dot>
              {published ? 'Visible para los clientes' : 'Nadie ve esta cuenta'}
            </Badge>
          </div>
          <p className={clsx('mt-1', typography.small)}>
            {published
              ? `Desde el ${s?.published_at ? formatDate(s.published_at) : '—'}. Los clientes ven ${dishes.published === 1 ? '1 plato' : `${dishes.published} platos`} de «${s?.display_name}».`
              : s
                ? readiness.canPublish
                  ? 'Todo lo obligatorio está listo: puedes publicar cuando quieras.'
                  : 'Completa lo obligatorio de la lista para poder publicar.'
                : 'Empieza por elegir qué platos ven los clientes. El nombre y la dirección son los de tu cuenta.'}
          </p>
        </div>
        {action}
      </section>

      <KpiStrip items={kpis} columns={4} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Lista para publicar" icon={ListChecks} description={`${readiness.done} de ${readiness.items.length} listos. Lo obligatorio permite publicar; lo demás mejora cómo te recomienda Quanela.`}>
          <ul className="divide-y divide-neutral-800/60">
            {readiness.items.map((item) => (
              <ReadinessRow key={item.id} item={item} onGoTo={onGoTo} />
            ))}
          </ul>
        </Card>
        <Preview state={state} />
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => setPublished(true)}
        pending={save.isPending}
        title="Publicar en Quanela Consumer"
        confirmLabel="Publicar"
        description={`Los clientes verán «${s?.display_name ?? ''}» con ${dishes.published === 1 ? '1 plato' : `${dishes.published} platos`}. Puedes pausar la publicación cuando quieras.`}
      />
    </div>
  )
}
