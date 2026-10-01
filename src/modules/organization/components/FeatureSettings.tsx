import { AccountIcon } from '@/shared/avatars/Avatar'
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
import { Plus, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
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
 * Settings of one feature, owned by the organization (ADR 0018): its values
 * (starting from the factory values) and, only where needed, exceptions for
 * specific accounts. Accounts no longer tune AI themselves.
 */
export function FeatureSettingsSection({
  organizationId,
  feature,
  accounts,
  canEdit,
  onChanged,
}: {
  organizationId: string
  feature: Feature
  accounts: Account[]
  canEdit: boolean
  onChanged: () => Promise<unknown> | void
}) {
  const fields = fieldsFor(feature.key)
  const { show } = useToast()
  const orgValues = pick(fields, { ...feature.platformSettings, ...feature.settings })
  const factory = pick(fields, feature.platformSettings)
  const [draft, setDraft] = useState<FeatureSettings | null>(null)
  const [exception, setException] = useState<{ accountId: string; values: FeatureSettings } | null>(null)

  const saveOrg = useMutation({
    mutationFn: (settings: FeatureSettings) => setOrganizationFeatureSettings(organizationId, feature.key, settings),
    onSuccess: async (_, settings) => {
      await onChanged()
      setDraft(null)
      show(Object.keys(settings).length === 0 ? `${feature.label}: valores de fábrica.` : `${feature.label}: guardado.`)
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar'), 'error'),
  })
  const saveAccount = useMutation({
    mutationFn: ({ accountId, settings }: { accountId: string; settings: FeatureSettings }) => setKitchenFeatureSettings(accountId, feature.key, settings),
    onSuccess: async (_, { settings }) => {
      await onChanged()
      setException(null)
      show(Object.keys(settings).length === 0 ? 'La cuenta vuelve a usar los valores de la organización.' : 'Excepción guardada.')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar'), 'error'),
  })

  if (fields.length === 0) return null
  const busy = saveOrg.isPending || saveAccount.isPending
  const form = draft ?? orgValues
  const isFactory = Object.keys(diffFrom(factory, orgValues)).length === 0
  const withException = accounts.filter((a) => Object.keys(a.overrides?.[feature.key] ?? {}).length > 0)
  const withoutException = accounts.filter((a) => !withException.includes(a))

  return (
    <Accordion
      title={
        <span className="inline-flex items-center gap-1.5">
          <SlidersHorizontal size={13} className="text-neutral-500" aria-hidden /> Ajustes
        </span>
      }
      summary={`${settingsSummary(feature.key, orgValues)}${withException.length ? ` · ${withException.length} ${withException.length === 1 ? 'excepción' : 'excepciones'}` : ''}`}
    >
      <div className="space-y-4">
        <div className="space-y-3">
          <p className={typography.caption}>Valen para todas las cuentas{isFactory ? ' (valores de fábrica)' : ''}.</p>
          <SettingsFields fields={fields} values={form} onChange={setDraft} disabled={!canEdit || busy} idPrefix={`org-${feature.key}`} />
          {canEdit && (
            <div className="flex flex-wrap justify-end gap-2">
              {!draft && !isFactory && (
                <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => saveOrg.mutate({})} loading={saveOrg.isPending}>
                  Valores de fábrica
                </Button>
              )}
              {draft && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={busy}>
                    Descartar
                  </Button>
                  <Button variant="primary" size="sm" loading={saveOrg.isPending} disabled={!isValid(fields, draft)} onClick={() => saveOrg.mutate(pick(fields, draft))}>
                    Guardar
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {accounts.length > 1 || withException.length > 0 ? (
          <div className="space-y-2 border-t border-neutral-800/60 pt-3">
            <p className="text-xs font-medium text-neutral-300">Excepciones por cuenta</p>
            {withException.length === 0 && !exception && <p className={typography.caption}>Todas las cuentas usan los valores de arriba.</p>}
            <ul className="space-y-2">
              {withException.map((a) => {
                const override = a.overrides?.[feature.key] ?? {}
                const editing = exception?.accountId === a.id
                return (
                  <li key={a.id} className="rounded-xl border border-neutral-800/60 px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <AccountIcon iconKey={a.iconKey} seed={a.id} size="xs" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-neutral-100">{a.name}</span>
                        <span className="block truncate text-[11px] text-brasa-300">{settingsSummary(feature.key, override)}</span>
                      </span>
                      {canEdit && !editing && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setException({ accountId: a.id, values: { ...orgValues, ...pick(fields, override) } })} disabled={busy}>
                            Editar
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => saveAccount.mutate({ accountId: a.id, settings: {} })} disabled={busy}>
                            Quitar
                          </Button>
                        </>
                      )}
                    </div>
                    {editing && exception && (
                      <ExceptionForm
                        fields={fields}
                        values={exception.values}
                        onChange={(values) => setException({ accountId: a.id, values })}
                        onCancel={() => setException(null)}
                        onSave={() => saveAccount.mutate({ accountId: a.id, settings: pick(fields, diffFrom(orgValues, exception.values)) })}
                        saving={saveAccount.isPending}
                        idPrefix={`acc-${a.id}-${feature.key}`}
                      />
                    )}
                  </li>
                )
              })}
              {exception && !withException.some((a) => a.id === exception.accountId) && (
                <li className="rounded-xl border border-brasa-500/30 px-3 py-2">
                  <p className="text-sm text-neutral-100">{accounts.find((a) => a.id === exception.accountId)?.name}</p>
                  <ExceptionForm
                    fields={fields}
                    values={exception.values}
                    onChange={(values) => setException({ ...exception, values })}
                    onCancel={() => setException(null)}
                    onSave={() => saveAccount.mutate({ accountId: exception.accountId, settings: pick(fields, diffFrom(orgValues, exception.values)) })}
                    saving={saveAccount.isPending}
                    idPrefix={`new-${feature.key}`}
                  />
                </li>
              )}
            </ul>
            {canEdit && !exception && withoutException.length > 0 && (
              <div className="flex items-center gap-2">
                <Plus size={13} className="text-neutral-500" aria-hidden />
                <Select
                  aria-label={`Agregar una excepción de ${feature.label}`}
                  value=""
                  onChange={(e) => e.target.value && setException({ accountId: e.target.value, values: { ...orgValues } })}
                  className="!mt-0 max-w-xs"
                  disabled={busy}
                >
                  <option value="">Valores distintos para una cuenta…</option>
                  {withoutException.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </Accordion>
  )
}

function ExceptionForm({
  fields,
  values,
  onChange,
  onCancel,
  onSave,
  saving,
  idPrefix,
}: {
  fields: EditableField[]
  values: FeatureSettings
  onChange: (values: FeatureSettings) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
  idPrefix: string
}) {
  return (
    <div className="mt-3 space-y-3 border-t border-neutral-800/60 pt-3">
      <SettingsFields fields={fields} values={values} onChange={onChange} disabled={saving} idPrefix={idPrefix} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="primary" size="sm" onClick={onSave} loading={saving} disabled={!isValid(fields, values)}>
          Guardar excepción
        </Button>
      </div>
    </div>
  )
}
