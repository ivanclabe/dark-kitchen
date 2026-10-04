import { setKitchenFeatureSettings, setOrganizationFeatureSettings, type FeatureMatrix, type FeatureSettings } from '@/shared/features/features'
import { Accordion } from '@/shared/ui/Accordion'
import { Button } from '@/shared/ui/Button'
import { Input, Select } from '@/shared/ui/FormField'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation } from '@tanstack/react-query'
import clsx from 'clsx'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { ScopeChoice, type SettingsScope } from './ScopeChoice'
import { diffFrom, fieldError, fieldsFor, settingsSummary, type EditableField } from '../lib/featureSettingFields'

type Feature = FeatureMatrix['features'][number]
type Account = FeatureMatrix['accounts'][number]

/** Inputs for a feature's settings; validation messages inline. */
export function SettingsFields({
  fields,
  values,
  onChange,
  disabled,
  idPrefix,
}: {
  fields: EditableField[]
  values: FeatureSettings
  onChange: (values: FeatureSettings) => void
  disabled?: boolean
  idPrefix: string
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => {
        const id = `${idPrefix}-${field.key}`
        const value = values[field.key]
        const error = fieldError(field, value)
        if (field.type === 'boolean') {
          return (
            <label key={field.key} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800/60 px-3 py-2.5 text-sm text-neutral-300 sm:col-span-2">
              {field.label}
              <Switch checked={value === true} onChange={(v) => onChange({ ...values, [field.key]: v })} label={field.label} disabled={disabled} />
            </label>
          )
        }
        return (
          <div key={field.key} className={clsx(field.type === 'choice' && 'sm:col-span-2')}>
            <label htmlFor={id} className="text-xs text-neutral-400">
              {field.label}
            </label>
            {field.type === 'choice' ? (
              <Select id={id} value={String(value ?? '')} onChange={(e) => onChange({ ...values, [field.key]: Number(e.target.value) })} disabled={disabled} className="!mt-1">
                {!field.options.some((o) => o.value === value) && typeof value === 'number' && <option value={value}>Personalizada ({value})</option>}
                {field.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="relative mt-1">
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={field.min}
                  max={field.max}
                  value={typeof value === 'number' ? value : ''}
                  onChange={(e) => onChange({ ...values, [field.key]: e.target.value === '' ? Number.NaN : Number(e.target.value) })}
                  disabled={disabled}
                  aria-invalid={Boolean(error)}
                  className={clsx('!mt-0', field.unit && 'pr-12')}
                />
                {field.unit && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-neutral-500">{field.unit}</span>}
              </div>
            )}
            {error ? <p className="mt-1 text-[11px] text-red-300">{error}</p> : field.hint && <p className={clsx('mt-1', typography.caption)}>{field.hint}</p>}
          </div>
        )
      })}
    </div>
  )
}

const pick = (fields: EditableField[], values: FeatureSettings): FeatureSettings => Object.fromEntries(fields.flatMap((f) => (values[f.key] === undefined ? [] : [[f.key, values[f.key]]])))
const isValid = (fields: EditableField[], values: FeatureSettings) => fields.every((f) => fieldError(f, values[f.key]) === null)

/**
 * Settings of one feature in the active account (ADR 0018, ADR 0024): the
 * general values apply to all your accounts; this account can have its own.
 * With a single account there is nothing to choose.
 */
export function FeatureSettingsSection({
  organizationId,
  feature,
  account,
  accountCount,
  canEdit,
  onChanged,
}: {
  organizationId: string
  feature: Feature
  account: Account
  accountCount: number
  canEdit: boolean
  onChanged: () => Promise<unknown> | void
}) {
  const fields = fieldsFor(feature.key)
  const { show } = useToast()
  const general = pick(fields, { ...feature.platformSettings, ...feature.settings })
  const factory = pick(fields, feature.platformSettings)
  const own = pick(fields, account.overrides?.[feature.key] ?? {})
  const hasOwn = Object.keys(own).length > 0
  const shared = accountCount > 1
  const [draft, setDraft] = useState<FeatureSettings | null>(null)
  const [scope, setScope] = useState<SettingsScope>(hasOwn ? 'account' : 'all')

  const saveGeneral = useMutation({
    mutationFn: (settings: FeatureSettings) => setOrganizationFeatureSettings(organizationId, feature.key, settings),
    onSuccess: async (_, settings) => {
      await onChanged()
      setDraft(null)
      show(Object.keys(settings).length === 0 ? `${feature.label}: valores de fábrica.` : `${feature.label}: guardado${shared ? ' para todas tus cuentas' : ''}.`)
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar'), 'error'),
  })
  const saveOwn = useMutation({
    mutationFn: (settings: FeatureSettings) => setKitchenFeatureSettings(account.id, feature.key, settings),
    onSuccess: async (_, settings) => {
      await onChanged()
      setDraft(null)
      if (Object.keys(settings).length === 0) setScope('all')
      show(Object.keys(settings).length === 0 ? 'Esta cuenta vuelve a usar los valores generales.' : `${feature.label}: guardado solo para esta cuenta.`)
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar'), 'error'),
  })

  if (fields.length === 0) return null
  const busy = saveGeneral.isPending || saveOwn.isPending
  const ownScope = shared && scope === 'account'
  const base = ownScope ? { ...general, ...own } : general
  const form = draft ?? base
  const isFactory = Object.keys(diffFrom(factory, general)).length === 0

  function save(values: FeatureSettings) {
    if (ownScope) saveOwn.mutate(pick(fields, diffFrom(general, values)))
    else saveGeneral.mutate(pick(fields, values))
  }

  return (
    <Accordion
      title={
        <span className="inline-flex items-center gap-1.5">
          <SlidersHorizontal size={13} className="text-neutral-500" aria-hidden /> Ajustes
        </span>
      }
      summary={`${settingsSummary(feature.key, hasOwn ? { ...general, ...own } : general)}${hasOwn ? ' · propios de esta cuenta' : ''}`}
    >
      <div className="space-y-3">
        {shared && canEdit && (
          <ScopeChoice
            value={scope}
            onChange={(next) => {
              setScope(next)
              setDraft(null)
            }}
            disabled={busy}
          />
        )}
        <p className={typography.caption}>
          {ownScope
            ? hasOwn
              ? 'Esta cuenta usa sus propios valores.'
              : 'Guarda valores distintos solo para esta cuenta; tus otras cuentas siguen con los generales.'
            : shared
              ? `Valores generales${isFactory ? ' (de fábrica)' : ''}: aplican a todas tus cuentas${hasOwn ? ' menos a esta, que tiene los suyos' : ''}.`
              : isFactory
                ? 'Valores de fábrica.'
                : 'Valores de esta cuenta.'}
        </p>
        <SettingsFields fields={fields} values={form} onChange={setDraft} disabled={!canEdit || busy} idPrefix={`${scope}-${feature.key}`} />
        {canEdit && (
          <div className="flex flex-wrap justify-end gap-2">
            {!draft && ownScope && hasOwn && (
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => saveOwn.mutate({})} loading={saveOwn.isPending}>
                Usar los valores generales
              </Button>
            )}
            {!draft && !ownScope && !isFactory && (
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => saveGeneral.mutate({})} loading={saveGeneral.isPending}>
                Valores de fábrica
              </Button>
            )}
            {draft && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={busy}>
                  Descartar
                </Button>
                <Button variant="primary" size="sm" loading={busy} disabled={!isValid(fields, draft)} onClick={() => save(draft)}>
                  {ownScope ? 'Guardar solo para esta cuenta' : shared ? 'Guardar para todas tus cuentas' : 'Guardar'}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </Accordion>
  )
}
