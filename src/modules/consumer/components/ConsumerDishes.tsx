import { ProductThumb } from '@/modules/products/components/ProductImage'
import { KitchenLink } from '@/shared/kitchen/KitchenLink'
import { Button } from '@/shared/ui/Button'
import { Chip } from '@/shared/ui/Chip'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Input } from '@/shared/ui/FormField'
import { SaveBar } from '@/shared/ui/SaveBar'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { Eye, EyeOff, ImageOff, Search, TextCursorInput, Utensils } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DIETARY_TAGS, saveStorefront, type StorefrontProduct, type StorefrontState } from '../api/storefront'
import { useSaveStorefrontProducts } from '../hooks/useStorefront'
import { filterDishes, type DishFilter } from '../lib/readiness'

type Draft = Pick<StorefrontProduct, 'published' | 'dietary_tags' | 'show_ingredients'>

const FILTERS: { value: DishFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'published', label: 'Publicados' },
  { value: 'hidden', label: 'Sin publicar' },
  { value: 'no_photo', label: 'Sin foto' },
  { value: 'no_description', label: 'Sin descripción' },
]

/** «sin foto» / «sin descripción»: it gets fixed in Catálogo, on that dish. */
function MissingLink({ productId, icon: Icon, label }: { productId: string; icon: typeof ImageOff; label: string }) {
  return (
    <KitchenLink
      to={`/menu-planner?plato=${productId}`}
      className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300 hover:bg-amber-500/20"
      title="Completar en Catálogo"
    >
      <Icon size={11} aria-hidden /> {label}
    </KitchenLink>
  )
}

/**
 * Platos (ADR 0046, D5): which dishes customers see and how — search,
 * filters, several at once, the photo, the dietary tags and whether the
 * ingredient names show. What a dish lacks links to it in Catálogo. One bar
 * saves every change. Price and today's availability come from the menu.
 */
export function ConsumerDishes({ state }: { state: StorefrontState }) {
  const { show } = useToast()
  const save = useSaveStorefrontProducts()
  const initial = useMemo(
    () => Object.fromEntries(state.products.map((p) => [p.id, { published: p.published, dietary_tags: p.dietary_tags, show_ingredients: p.show_ingredients }])) as Record<string, Draft>,
    [state],
  )
  const [drafts, setDrafts] = useState(initial)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [filter, setFilter] = useState<DishFilter>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const visible = filterDishes(state.products, drafts, filter, search)
  const counts = Object.fromEntries(FILTERS.map((f) => [f.value, filterDishes(state.products, drafts, f.value, '').length])) as Record<DishFilter, number>
  const changed = state.products.filter((p) => JSON.stringify(drafts[p.id]) !== JSON.stringify(initial[p.id]))
  const update = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id))

  function toggleSelected(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function setManyPublished(published: boolean) {
    setDrafts((d) => {
      const next = { ...d }
      for (const id of selected) next[id] = { ...next[id], published }
      return next
    })
    setSelected(new Set())
  }

  if (state.products.length === 0) {
    return <EmptyState icon={Utensils} title="Esta cuenta no tiene platos activos" description="Crea o activa platos en Catálogo para poder publicarlos." />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar plato o categoría…" aria-label="Buscar plato" className="!mt-0 pl-9" />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar platos">
          {FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} count={counts[f.value]} active={filter === f.value} onClick={() => setFilter(f.value)} />
          ))}
        </div>
      </div>

      <p className={typography.caption}>Solo se ven los platos activos que publiques. El precio y si está disponible hoy salen del menú del día; las etiquetas las declaras tú.</p>

      <div className="overflow-hidden rounded-2xl border border-neutral-800/60">
        <div className="flex flex-wrap items-center gap-3 border-b border-neutral-800/60 bg-neutral-900/60 px-4 py-2.5">
          <label className="inline-flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((p) => p.id)))}
              className="size-4 accent-brasa-500"
              aria-label="Seleccionar los platos de la lista"
            />
            {selected.size > 0 ? `${selected.size} ${selected.size === 1 ? 'seleccionado' : 'seleccionados'}` : `${visible.length} ${visible.length === 1 ? 'plato' : 'platos'}`}
          </label>
          {selected.size > 0 && (
            <div className="ml-auto flex gap-2">
              <Button size="sm" icon={Eye} onClick={() => setManyPublished(true)}>
                Publicar
              </Button>
              <Button size="sm" variant="ghost" icon={EyeOff} onClick={() => setManyPublished(false)}>
                Ocultar
              </Button>
            </div>
          )}
        </div>

        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">Ningún plato coincide.</p>
        ) : (
          <ul className="divide-y divide-neutral-800/60">
            {visible.map((p) => {
              const d = drafts[p.id]
              return (
                <li key={p.id} className={clsx('flex gap-3 px-4 py-3.5', selected.has(p.id) && 'bg-brasa-500/[0.04]')}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelected(p.id)} className="mt-3 size-4 shrink-0 accent-brasa-500" aria-label={`Seleccionar ${p.name}`} />
                  <ProductThumb name={p.name} path={p.image_path} toneSeed={p.category} size="md" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-neutral-100">{p.name}</p>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-400">
                          <span className="tabular-nums">{formatMoney(p.price)}</span>
                          {p.category && <span>· {p.category}</span>}
                          {!p.image_path && <MissingLink productId={p.id} icon={ImageOff} label="sin foto" />}
                          {!p.has_description && <MissingLink productId={p.id} icon={TextCursorInput} label="sin descripción" />}
                        </p>
                      </div>
                      <label className="inline-flex shrink-0 items-center gap-2 text-xs text-neutral-400">
                        {d.published ? 'Publicado' : 'Oculto'}
                        <Switch checked={d.published} onChange={(v) => update(p.id, { published: v })} label={`Publicar ${p.name}`} />
                      </label>
                    </div>
                    {d.published && (
                      <div className="flex flex-wrap items-center gap-2">
                        {DIETARY_TAGS.map((t) => {
                          const on = d.dietary_tags.includes(t.value)
                          return (
                            <button
                              key={t.value}
                              type="button"
                              aria-pressed={on}
                              onClick={() => update(p.id, { dietary_tags: on ? d.dietary_tags.filter((x) => x !== t.value) : [...d.dietary_tags, t.value] })}
                              className={clsx(
                                'rounded-full px-2.5 py-1 text-xs transition',
                                on ? 'bg-brasa-500/15 text-brasa-300 ring-1 ring-brasa-500/40' : 'bg-neutral-900 text-neutral-400 ring-1 ring-neutral-800 hover:text-neutral-200',
                              )}
                            >
                              {t.label}
                            </button>
                          )
                        })}
                        <label className={clsx('ml-auto inline-flex items-center gap-2 text-xs', p.has_recipe ? 'text-neutral-300' : 'text-neutral-600')}>
                          <Switch checked={d.show_ingredients} disabled={!p.has_recipe} onChange={(v) => update(p.id, { show_ingredients: v })} label={`Mostrar ingredientes de ${p.name}`} />
                          {p.has_recipe ? 'Mostrar ingredientes (solo nombres)' : 'Sin receta: no hay ingredientes'}
                        </label>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <SaveBar
        dirty={changed.length > 0}
        saving={save.isPending}
        savedAt={savedAt}
        error={save.error ? getErrorMessage(save.error, 'No se pudieron guardar los platos') : null}
        onDiscard={() => setDrafts(initial)}
        onSave={async () => {
          // ADR 0047: the identity is the account's, so the first dishes can be chosen before any profile: the
          // publication is created here, NOT published (that is done from Resumen).
          if (!state.storefront) {
            try {
              await saveStorefront({ published: false, tagline: null, latitude: null, longitude: null, whatsapp_phone: null, share_metrics: false })
            } catch (e) {
              show(getErrorMessage(e, 'No se pudieron guardar los platos'), 'error')
              return
            }
          }
          save.mutate(
            changed.map((p) => ({ product_id: p.id, ...drafts[p.id] })),
            {
              onSuccess: () => {
                setSavedAt(Date.now())
                show(state.storefront?.published ? 'Platos guardados: ya se ven en Quanela Consumer.' : 'Platos guardados.')
              },
              onError: (e) => show(getErrorMessage(e, 'No se pudieron guardar los platos'), 'error'),
            },
          )
        }}
      />
    </div>
  )
}
