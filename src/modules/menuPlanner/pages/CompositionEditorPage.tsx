import { useIngredients } from '@/modules/supply/hooks/useIngredients'
import { useProducts } from '@/modules/products/hooks/useProducts'
import { useComposition, useSaveComposition } from '@/modules/products/hooks/useComposition'
import type { Composition, CompositionInput } from '@/modules/products/api/composition'
import { useBackTarget } from '@/shared/hooks/useBackTarget'
import { useIngredientUnits } from '@/shared/hooks/useIngredientUnits'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { adminPickerStyle } from '@/shared/composition/adminPickerStyle'
import { chosenOptions, defaultSelection, missingGroups, unitPrice, type OptionGroup, type OptionPricing, type Selection } from '@/shared/composition/composition'
import { OptionPicker } from '@/shared/composition/OptionPicker'
import { compatibleUnits, toBase, unitLabel } from '@/shared/units/conversion'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Combobox } from '@/shared/ui/Combobox'
import { CurrencyInput } from '@/shared/ui/CurrencyInput'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { Input, Select } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { NumberInput } from '@/shared/ui/NumberInput'
import { NumberStepper } from '@/shared/ui/NumberStepper'
import { Page } from '@/shared/ui/Page'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { cardClass } from '@/shared/ui/formClasses'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, Layers, Plus, Save, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

interface DraftOption {
  key: string
  id: string | null
  name: string
  pricing: OptionPricing
  price: number
  isDefault: boolean
  active: boolean
  /** '' (consumes nothing), 'ing:<id>' (an ingredient or preparation) or 'prod:<id>' (another dish's recipe). */
  component: string
  quantity: number | null
  unitCode: string | null
}

interface DraftGroup {
  key: string
  id: string | null
  name: string
  required: boolean
  maxSelect: number
  allowRepeat: boolean
  options: DraftOption[]
}

const newKey = () => crypto.randomUUID()
const option = (name: string, pricing: OptionPricing = 'included', price = 0, isDefault = false): DraftOption => ({
  key: newKey(), id: null, name, pricing, price, isDefault, active: true, component: '', quantity: null, unitCode: null,
})
const group = (name: string, required: boolean, maxSelect: number, options: DraftOption[], allowRepeat = false): DraftGroup => ({
  key: newKey(), id: null, name, required, maxSelect, allowRepeat, options,
})

/** Quick starts (ADR 0059, D7): the usual shapes of a Colombian lunch and a combo. */
const TEMPLATES: { name: string; description: string; groups: () => DraftGroup[] }[] = [
  {
    name: 'Corrientazo',
    description: 'Sopa, principio, proteína, bebida y acompañantes',
    groups: () => [
      group('Sopa', true, 1, [option('Sopa del día', 'included', 0, true)]),
      group('Principio', true, 1, [option('Frijoles', 'included', 0, true), option('Lentejas')]),
      group('Proteína', true, 1, [option('Pollo', 'included', 0, true), option('Res', 'extra', 3000)]),
      group('Bebida', true, 1, [option('Limonada', 'included', 0, true), option('Jugo del día')]),
      group('Acompañantes', false, 3, [option('Patacones', 'extra', 2000), option('Tajadas', 'extra', 1500), option('Yuca', 'courtesy')], true),
    ],
  },
  {
    name: 'Combo',
    description: 'Bebida y acompañante',
    groups: () => [group('Bebida', true, 1, [option('Gaseosa', 'included', 0, true)]), group('Acompañante', true, 1, [option('Papas', 'included', 0, true)])],
  },
]

const PRICING_LABEL: Record<OptionPricing, string> = { included: 'Incluido', extra: 'Extra', courtesy: 'Cortesía' }

function toDraft(composition: Composition, unitCodeOf: (id: string | null) => string | null): DraftGroup[] {
  return composition.groups.map((g) => ({
    key: g.id,
    id: g.id,
    name: g.name,
    required: g.minSelect > 0,
    maxSelect: g.maxSelect,
    allowRepeat: g.allowRepeat,
    options: g.options.map((o) => ({
      key: o.id,
      id: o.id,
      name: o.name,
      pricing: o.pricing,
      price: o.price,
      isDefault: o.isDefault,
      active: o.active,
      component: o.componentIngredientId ? `ing:${o.componentIngredientId}` : o.componentProductId ? `prod:${o.componentProductId}` : '',
      // As it was written (350 ml), even when stored in the base (0,35 l).
      quantity: o.componentUnitQuantity ?? o.componentQuantity,
      unitCode: unitCodeOf(o.componentUnitId) ?? o.componentUnitCode,
    })),
  }))
}

function Editor({ composition }: { composition: Composition }) {
  const { can } = useActiveKitchen()
  const { show } = useToast()
  const back = useBackTarget({ to: '/menu-planner', label: 'Volver al catálogo' })
  const save = useSaveComposition(composition.productId)
  const { data: ingredients = [] } = useIngredients()
  const { data: products = [] } = useProducts()
  const { units, infoFor } = useIngredientUnits()
  const unitCodeOf = (id: string | null) => (id ? (units.find((u) => u.id === id)?.code ?? null) : null)
  const [groups, setGroups] = useState<DraftGroup[]>(() => toDraft(composition, unitCodeOf))
  const [error, setError] = useState<string | null>(null)
  const readOnly = composition.masterCopy || !can('products.edit')

  const componentOptions = useMemo(
    () => [
      ...ingredients
        .filter((i) => i.active)
        .map((i) => ({ value: `ing:${i.id}`, label: i.name, sublabel: `${i.isPreparation ? 'Preparación' : 'Insumo'} · ${i.baseUnitCode}` })),
      ...products.filter((p) => p.id !== composition.productId && p.active).map((p) => ({ value: `prod:${p.id}`, label: p.name, sublabel: 'Plato · su receta' })),
    ],
    [ingredients, products, composition.productId],
  )

  /** What one unit of an option costs today: its ingredient at average cost, or the other dish's recipe. */
  function optionCost(o: DraftOption): number {
    if (o.component.startsWith('ing:')) {
      const ingredient = ingredients.find((i) => i.id === o.component.slice(4))
      if (!ingredient || !o.quantity) return 0
      const base = !o.unitCode || o.unitCode === ingredient.baseUnitCode ? o.quantity : (toBase(o.quantity, o.unitCode, infoFor(ingredient), units) ?? 0)
      return base * ingredient.avgCost
    }
    if (o.component.startsWith('prod:')) return products.find((p) => p.id === o.component.slice(5))?.estimatedCost ?? 0
    return 0
  }

  const update = (key: string, patch: Partial<DraftGroup>) => setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...patch } : g)))
  const updateOption = (gKey: string, oKey: string, patch: Partial<DraftOption>) =>
    setGroups((gs) => gs.map((g) => (g.key === gKey ? { ...g, options: g.options.map((o) => (o.key === oKey ? { ...o, ...patch } : o)) } : g)))
  const move = (index: number, delta: -1 | 1) =>
    setGroups((gs) => {
      const next = [...gs]
      const [g] = next.splice(index, 1)
      next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, g)
      return next
    })

  // The preview: what the customer will see, with the costs behind it.
  const previewGroups: OptionGroup[] = groups
    .map((g) => ({
      id: g.key,
      name: g.name || 'Sin nombre',
      minSelect: g.required ? 1 : 0,
      maxSelect: g.maxSelect,
      allowRepeat: g.allowRepeat,
      options: g.options.filter((o) => o.active && o.name.trim()).map((o) => ({ id: o.key, name: o.name, pricing: o.pricing, price: o.pricing === 'extra' ? o.price : 0, isDefault: o.isDefault })),
    }))
    .filter((g) => g.options.length)
  const [preview, setPreview] = useState<Selection | null>(null)
  const selection = preview ?? defaultSelection(previewGroups)
  const costOf = (optionKey: string) => {
    const o = groups.flatMap((g) => g.options).find((x) => x.key === optionKey)
    return o ? optionCost(o) : 0
  }
  const chosen = chosenOptions(previewGroups, selection)
  const previewCost = composition.recipeCost + chosen.reduce((sum, o) => sum + costOf(o.optionId) * o.quantity, 0)
  const previewPrice = unitPrice(composition.price, previewGroups, selection)

  async function handleSave() {
    setError(null)
    const input: CompositionInput[] = groups.map((g) => ({
      id: g.id,
      name: g.name.trim(),
      minSelect: g.required ? 1 : 0,
      maxSelect: g.maxSelect,
      allowRepeat: g.allowRepeat,
      options: g.options.map((o) => {
        const ingredient = o.component.startsWith('ing:') ? ingredients.find((i) => i.id === o.component.slice(4)) : undefined
        return {
          id: o.id,
          name: o.name.trim(),
          pricing: o.pricing,
          price: o.pricing === 'extra' ? o.price : 0,
          isDefault: o.isDefault,
          active: o.active,
          componentIngredientId: ingredient?.id ?? null,
          componentQuantity: ingredient ? o.quantity : null,
          componentUnitId: ingredient && o.unitCode && o.unitCode !== ingredient.baseUnitCode ? (units.find((u) => u.code === o.unitCode)?.id ?? null) : null,
          componentProductId: o.component.startsWith('prod:') ? o.component.slice(5) : null,
        }
      }),
    }))
    try {
      const saved = await save.mutateAsync(input)
      setGroups(toDraft(saved, unitCodeOf))
      setPreview(null)
      show(`Composición de «${composition.name}» guardada.`)
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo guardar la composición'))
    }
  }

  return (
    <Page>
      <PageHeader
        help="dish-composition"
        title={`Composición — ${composition.name}`}
        description={`Precio base ${formatMoney(composition.price)} · lo que el cliente elige: sopa, proteína, bebida, acompañantes…`}
        icon={Layers}
        meta={composition.masterCopy ? <Badge tone="neutral">Menú maestro</Badge> : groups.length ? <Badge tone="info">{groups.length} grupos</Badge> : null}
        backTo={back.to}
        backLabel={back.label}
        actions={
          !readOnly && (
            <Button variant="primary" icon={Save} onClick={() => void handleSave()} loading={save.isPending}>
              Guardar composición
            </Button>
          )
        }
      />

      {composition.masterCopy && (
        <p role="status" className="rounded-xl border border-neutral-50/30 bg-neutral-50/5 px-4 py-2.5 text-sm text-neutral-300">
          Este plato viene de un menú maestro: su composición no se edita aquí.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {groups.length === 0 ? (
            <div className={cardClass}>
              <EmptyState
                icon={Layers}
                title="Este plato no tiene opciones"
                description="Agrega grupos para que el cliente elija (sopa, proteína, bebida, acompañantes) o empieza con una plantilla."
                action={
                  !readOnly && (
                    <div className="flex flex-wrap justify-center gap-2">
                      {TEMPLATES.map((t) => (
                        <Button key={t.name} variant="secondary" size="sm" onClick={() => setGroups(t.groups())} title={t.description}>
                          Plantilla: {t.name}
                        </Button>
                      ))}
                      <Button variant="secondary" size="sm" icon={Plus} onClick={() => setGroups([group('Nuevo grupo', true, 1, [option('Opción 1', 'included', 0, true)])])}>
                        Grupo en blanco
                      </Button>
                    </div>
                  )
                }
              />
            </div>
          ) : (
            groups.map((g, gi) => (
              <section key={g.key} aria-label={`Grupo ${g.name || gi + 1}`} className={clsx(cardClass, 'space-y-4')}>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="min-w-48 flex-1">
                    <span className="text-xs font-medium text-neutral-400">Nombre del grupo</span>
                    <Input value={g.name} onChange={(e) => update(g.key, { name: e.target.value })} disabled={readOnly} maxLength={60} placeholder="Sopa, Proteína…" />
                  </label>
                  <div className="flex items-center gap-2 pb-2.5">
                    <Switch checked={g.required} onChange={(required) => update(g.key, { required })} label={`Obligatorio: ${g.name}`} disabled={readOnly} />
                    <span className="text-sm text-neutral-300">Obligatorio</span>
                  </div>
                  <label>
                    <span className="text-xs font-medium text-neutral-400">Elige hasta</span>
                    <NumberStepper value={g.maxSelect} onChange={(maxSelect) => update(g.key, { maxSelect: Math.max(1, Math.min(10, maxSelect)) })} min={1} aria-label={`Elige hasta, ${g.name}`} />
                  </label>
                  <div className="flex items-center gap-2 pb-2.5">
                    <Switch checked={g.allowRepeat} onChange={(allowRepeat) => update(g.key, { allowRepeat })} label={`Permite repetir: ${g.name}`} disabled={readOnly} />
                    <span className="text-sm text-neutral-300">Permite repetir</span>
                  </div>
                  {!readOnly && (
                    <div className="ml-auto flex items-center gap-1 pb-1.5">
                      <Button variant="ghost" size="sm" icon={ArrowUp} onClick={() => move(gi, -1)} disabled={gi === 0} aria-label={`Subir ${g.name}`} />
                      <Button variant="ghost" size="sm" icon={ArrowDown} onClick={() => move(gi, 1)} disabled={gi === groups.length - 1} aria-label={`Bajar ${g.name}`} />
                      <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setGroups((gs) => gs.filter((x) => x.key !== g.key))} aria-label={`Quitar el grupo ${g.name}`} />
                    </div>
                  )}
                </div>

                <ul className="space-y-2">
                  {g.options.map((o) => {
                    const ingredient = o.component.startsWith('ing:') ? ingredients.find((i) => i.id === o.component.slice(4)) : undefined
                    const unitOptions = ingredient ? compatibleUnits(infoFor(ingredient), units) : []
                    const cost = optionCost(o)
                    return (
                      <li key={o.key} className={clsx('space-y-2 rounded-xl border border-neutral-800 p-3', !o.active && 'opacity-60')} aria-label={`Opción ${o.name}`}>
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_130px]">
                          <Input value={o.name} onChange={(e) => updateOption(g.key, o.key, { name: e.target.value })} disabled={readOnly} maxLength={60} aria-label="Nombre de la opción" placeholder="Patacones" />
                          <Select
                            aria-label={`Tipo de precio de ${o.name}`}
                            value={o.pricing}
                            onChange={(e) => updateOption(g.key, o.key, { pricing: e.target.value as OptionPricing })}
                            disabled={readOnly}
                          >
                            {(Object.keys(PRICING_LABEL) as OptionPricing[]).map((p) => (
                              <option key={p} value={p}>
                                {PRICING_LABEL[p]}
                              </option>
                            ))}
                          </Select>
                          {o.pricing === 'extra' ? (
                            <CurrencyInput value={o.price || null} onValueChange={(v) => updateOption(g.key, o.key, { price: v ?? 0 })} disabled={readOnly} aria-label={`Precio extra de ${o.name}`} />
                          ) : (
                            <span className="flex items-center text-sm text-neutral-500">{o.pricing === 'courtesy' ? 'Sin costo para el cliente' : 'Incluido en el precio'}</span>
                          )}
                        </div>
                        <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_110px_100px]">
                          <Combobox
                            aria-label={`Qué consume ${o.name}`}
                            value={o.component}
                            onChange={(component) => updateOption(g.key, o.key, { component, unitCode: null, quantity: component.startsWith('ing:') ? o.quantity : null })}
                            options={componentOptions}
                            placeholder="No consume inventario"
                            emptyMessage="Sin insumos, preparaciones ni platos con ese nombre"
                            disabled={readOnly}
                          />
                          {ingredient ? (
                            <>
                              <NumberInput value={o.quantity} onValueChange={(quantity) => updateOption(g.key, o.key, { quantity })} decimals={3} min={0} disabled={readOnly} aria-label={`Cantidad de ${o.name}`} className="!mt-0" />
                              <Select
                                aria-label={`Unidad de ${o.name}`}
                                value={o.unitCode ?? ingredient.baseUnitCode}
                                onChange={(e) => updateOption(g.key, o.key, { unitCode: e.target.value })}
                                disabled={readOnly}
                                className="!mt-0"
                              >
                                {(unitOptions.length ? unitOptions : [{ code: ingredient.baseUnitCode }]).map((u) => (
                                  <option key={u.code} value={u.code}>
                                    {unitLabel(u.code, 2)}
                                  </option>
                                ))}
                              </Select>
                            </>
                          ) : (
                            <span className="text-xs text-neutral-500 sm:col-span-2">{o.component.startsWith('prod:') ? 'Consume la receta de ese plato' : ''}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          <label className="flex items-center gap-1.5 text-neutral-300">
                            <input type="checkbox" checked={o.isDefault} onChange={(e) => updateOption(g.key, o.key, { isDefault: e.target.checked })} disabled={readOnly} className="accent-neutral-50" />
                            Predeterminada
                          </label>
                          <label className="flex items-center gap-1.5 text-neutral-300">
                            <input type="checkbox" checked={o.active} onChange={(e) => updateOption(g.key, o.key, { active: e.target.checked })} disabled={readOnly} className="accent-neutral-50" />
                            Activa
                          </label>
                          <span className="text-neutral-500 tabular-nums">Costo {formatMoney(cost, { decimals: 'auto' })}</span>
                          {o.pricing === 'extra' && o.price > 0 && (
                            <span className={clsx('tabular-nums', o.price - cost >= 0 ? 'text-emerald-400' : 'text-red-400')}>Margen {formatMoney(o.price - cost)}</span>
                          )}
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => update(g.key, { options: g.options.filter((x) => x.key !== o.key) })}
                              className="ml-auto text-neutral-500 hover:text-red-400"
                              aria-label={`Quitar la opción ${o.name}`}
                            >
                              <Trash2 size={14} aria-hidden />
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {!readOnly && (
                  <Button variant="link" size="sm" icon={Plus} onClick={() => update(g.key, { options: [...g.options, option('')] })}>
                    Agregar opción
                  </Button>
                )}
              </section>
            ))
          )}
          {groups.length > 0 && !readOnly && (
            <Button variant="secondary" icon={Plus} onClick={() => setGroups((gs) => [...gs, group('', false, 1, [option('')])])}>
              Agregar grupo
            </Button>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card title="Así lo ve el cliente" description="Prueba las opciones: el total cambia como en el menú público.">
            {previewGroups.length === 0 ? (
              <p className={typography.caption}>Agrega opciones para verlas aquí.</p>
            ) : (
              <div className="space-y-4" style={adminPickerStyle}>
                <OptionPicker groups={previewGroups} selection={selection} onChange={setPreview} />
                {missingGroups(previewGroups, selection).length > 0 && (
                  <p className="text-xs text-amber-300">Falta elegir: {missingGroups(previewGroups, selection).map((x) => x.name).join(', ')}</p>
                )}
              </div>
            )}
          </Card>
          <Card title="Precio y costo" description="Con lo elegido en la vista previa, a los costos de hoy.">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-400">Precio para el cliente</dt>
                <dd className="font-semibold text-neutral-100 tabular-nums">{formatMoney(previewPrice)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-400">Receta del plato</dt>
                <dd className="text-neutral-300 tabular-nums">{formatMoney(composition.recipeCost, { decimals: 'auto' })}</dd>
              </div>
              {chosen.map((o) => (
                <div key={o.optionId} className="flex justify-between">
                  <dt className="text-neutral-400">
                    {o.name}
                    {o.quantity > 1 ? ` ×${o.quantity}` : ''}
                  </dt>
                  <dd className="text-neutral-300 tabular-nums">{formatMoney(costOf(o.optionId) * o.quantity, { decimals: 'auto' })}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-neutral-800 pt-2">
                <dt className="text-neutral-300">Costo</dt>
                <dd className="font-semibold text-neutral-100 tabular-nums">{formatMoney(previewCost)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-300">Margen</dt>
                <dd className={clsx('font-semibold tabular-nums', previewPrice - previewCost >= 0 ? 'text-emerald-400' : 'text-red-400')}>{formatMoney(previewPrice - previewCost)}</dd>
              </div>
            </dl>
          </Card>
          <p className={typography.caption}>
            Cada opción puede consumir un insumo o una preparación (en la unidad que quieras: se convierte sola) o la receta de otro plato. Al confirmar el pedido se reserva
            lo que el cliente eligió, y la cocina lo descuenta al marcarlo listo.
          </p>
        </aside>
      </div>
    </Page>
  )
}

export function CompositionEditorPage() {
  const { productId = '' } = useParams<{ productId: string }>()
  const { data, isLoading, isError, error, refetch } = useComposition(productId)
  // The units first: an option saved as «350 ml» must not show as «350 l».
  const { isLoading: unitsLoading } = useIngredientUnits()
  if (isError)
    return (
      <Page>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Page>
    )
  if (isLoading || unitsLoading || !data)
    return (
      <Page>
        <LoadingState variant="block" label="Cargando composición…" />
      </Page>
    )
  return <Editor key={data.productId} composition={data} />
}
