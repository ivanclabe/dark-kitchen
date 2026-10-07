import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Combobox } from '@/shared/ui/Combobox'
import { Input } from '@/shared/ui/FormField'
import { InfoTip } from '@/shared/ui/InfoTip'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage, isUniqueViolation } from '@/shared/utils/errors'
import { Heart, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useAddPreference, usePreferenceOptions, useRemovePreference } from '../../hooks/useCustomerProfile'
import { DIETARY_SUGGESTIONS, PREFERENCE_KIND, preferencesOf } from '../../lib/profile'
import type { CustomerPreference, PreferenceKind } from '../../types'

const ORDER: PreferenceKind[] = ['favorite_dish', 'disliked_ingredient', 'liked_ingredient', 'dietary']

const INFO: Record<PreferenceKind, string> = {
  favorite_dish: 'Platos del catálogo que el cliente pide o dice que le encantan.',
  liked_ingredient: 'Ingredientes que el cliente pide de más o le gustan.',
  disliked_ingredient: 'Lo que no quiere en sus platos. Tenlo en cuenta al tomar el pedido (por ejemplo, como observación del plato).',
  dietary: 'Lo que el cliente indica de su alimentación (vegetariano, sin gluten…). Es lo que el cliente dijo, no un diagnóstico.',
}

function PrefChip({ pref, tone, onRemove }: { pref: CustomerPreference; tone: (typeof PREFERENCE_KIND)[PreferenceKind]['tone']; onRemove?: () => void }) {
  return (
    <Badge tone={tone} className="gap-1 pr-1">
      <span className={pref.active ? undefined : 'line-through opacity-70'} title={pref.active ? pref.note ?? undefined : 'Ya no está activo en el catálogo'}>
        {pref.name}
      </span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Quitar ${pref.name}`} className="rounded-full p-0.5 opacity-70 hover:bg-black/20 hover:opacity-100">
          <X size={11} aria-hidden />
        </button>
      )}
    </Badge>
  )
}

/** The way to add one preference of a kind: a dish or ingredient of the catalog, or a short free text. */
function AddPreference({ customerId, kind, existing }: { customerId: string; kind: PreferenceKind; existing: CustomerPreference[] }) {
  const options = usePreferenceOptions()
  const add = useAddPreference(customerId)
  const { show } = useToast()
  const [text, setText] = useState('')

  async function save(input: { productId?: string; ingredientId?: string; label?: string }) {
    try {
      await add.mutateAsync({ customerId, kind, ...input })
      setText('')
    } catch (err) {
      show(isUniqueViolation(err) ? 'Ya estaba anotado.' : getErrorMessage(err, 'No se pudo guardar la preferencia'), isUniqueViolation(err) ? 'info' : 'error')
    }
  }

  if (kind === 'dietary') {
    const taken = new Set(existing.map((p) => p.name.toLowerCase()))
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {DIETARY_SUGGESTIONS.filter((s) => !taken.has(s.toLowerCase())).map((s) => (
            <button key={s} type="button" onClick={() => void save({ label: s })} className="rounded-full border border-dashed border-neutral-700 px-2.5 py-1 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-100">
              + {s}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) void save({ label: text })
          }}
        >
          <Input aria-label="Otra preferencia alimentaria" value={text} onChange={(e) => setText(e.target.value)} maxLength={80} placeholder="Otra (ej. sin cebolla cruda)" className="!mt-0" />
          <Button type="submit" variant="secondary" size="sm" icon={Plus} disabled={!text.trim()} loading={add.isPending}>
            Agregar
          </Button>
        </form>
      </div>
    )
  }

  const isDish = kind === 'favorite_dish'
  const taken = new Set(existing.map((p) => (isDish ? p.productId : p.ingredientId)).filter(Boolean))
  const list = (isDish ? options.data?.dishes : options.data?.ingredients) ?? []
  return (
    <Combobox
      value=""
      onChange={(id) => void save(isDish ? { productId: id } : { ingredientId: id })}
      options={list.filter((o) => !taken.has(o.id)).map((o) => ({ value: o.id, label: o.name }))}
      placeholder={isDish ? 'Agregar un plato…' : 'Agregar un ingrediente…'}
      emptyMessage={isDish ? 'Sin platos con ese nombre' : 'No está en el inventario'}
      // An ingredient that is not used in this kitchen can still be noted, as text.
      onCreateNew={isDish ? undefined : (q) => void save({ label: q })}
      createLabel={isDish ? undefined : (q) => `Anotar «${q}»`}
      aria-label={isDish ? 'Agregar plato favorito' : `Agregar a «${PREFERENCE_KIND[kind].title}»`}
    />
  )
}

/**
 * Preferencias (ADR 0040): favourite dishes and liked/disliked ingredients
 * from the catalog (by id), and what the customer says about their diet.
 * `compact`: the chips only (the summary). Removing asks first.
 */
export function CustomerPreferences({ customerId, preferences, canEdit, compact = false }: { customerId: string; preferences: CustomerPreference[]; canEdit: boolean; compact?: boolean }) {
  const remove = useRemovePreference(customerId)
  const { show } = useToast()
  const [removing, setRemoving] = useState<CustomerPreference | null>(null)

  if (compact) {
    return (
      <Card title="Preferencias" icon={Heart}>
        {preferences.length === 0 ? (
          <p className="text-sm text-neutral-500">Sin preferencias anotadas.</p>
        ) : (
          <div className="space-y-3">
            {ORDER.map((kind) => {
              const list = preferencesOf(preferences, kind)
              if (list.length === 0) return null
              return (
                <div key={kind}>
                  <p className={typography.label}>{PREFERENCE_KIND[kind].title}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {list.map((p) => (
                      <PrefChip key={p.id} pref={p} tone={PREFERENCE_KIND[kind].tone} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {ORDER.map((kind) => {
        const list = preferencesOf(preferences, kind)
        return (
          <Card
            key={kind}
            title={
              <span className="flex items-center">
                {PREFERENCE_KIND[kind].title}
                <InfoTip text={INFO[kind]} label={`Qué es «${PREFERENCE_KIND[kind].title}»`} />
              </span>
            }
          >
            <div className="space-y-3">
              {list.length === 0 ? (
                <p className="text-sm text-neutral-500">{PREFERENCE_KIND[kind].empty}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {list.map((p) => (
                    <PrefChip key={p.id} pref={p} tone={PREFERENCE_KIND[kind].tone} onRemove={canEdit ? () => setRemoving(p) : undefined} />
                  ))}
                </div>
              )}
              {canEdit && <AddPreference customerId={customerId} kind={kind} existing={list} />}
            </div>
          </Card>
        )
      })}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return
          remove.mutate(removing.id, {
            onSuccess: () => setRemoving(null),
            onError: (err) => show(getErrorMessage(err, 'No se pudo quitar'), 'error'),
          })
        }}
        title="Quitar preferencia"
        description={<p>Se quita «{removing?.name}» de las preferencias de este cliente.</p>}
        confirmLabel="Sí, quitar"
        danger
        pending={remove.isPending}
      />
    </div>
  )
}
