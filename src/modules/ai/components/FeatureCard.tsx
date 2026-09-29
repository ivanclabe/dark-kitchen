import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/FormField'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDateTime } from '@/shared/utils/format'
import clsx from 'clsx'
import { RefreshCw, Sparkles, Workflow } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { FeatureStatusBadge, FeatureUnavailableNote } from '@/modules/settings/components/FeatureStatus'
import { useLatestAiInsight, useRefreshAiInsight, useUpdateAiFeature } from '../hooks/useAi'
import { retryLabel, settingError, withDefaults, type FeatureDefinition } from '../lib/catalog'
import type { AiInsightFeatureKey, AiSettings } from '../types'

function LastRun({ feature }: { feature: AiInsightFeatureKey }) {
  const { data: last } = useLatestAiInsight(feature)
  const refresh = useRefreshAiInsight(feature)
  const { show } = useToast()

  async function runNow() {
    const result = await refresh.mutateAsync()
    if (result.kind === 'ok') show(result.insight.status === 'empty' ? 'Análisis listo: no hay nada que señalar.' : `Análisis listo: ${result.insight.items.length} recomendaciones.`)
    else if (result.kind === 'not_configured') show('La IA todavía no está conectada en la plataforma.', 'error')
    else if (result.kind === 'disabled') show('Esta función no está activa en la cuenta.', 'error')
    else if (result.kind === 'rate_limited') show(`${result.message} Vuelve a intentarlo ${retryLabel(result.retryAfter)}.`, 'error')
    else show(result.message, 'error')
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800/60 pt-3 text-xs text-neutral-500">
      <span>
        {last
          ? `Último análisis: ${formatDateTime(last.createdAt)} · ${last.status === 'error' ? 'falló' : last.status === 'empty' ? 'sin hallazgos' : `${last.items.length} recomendaciones`}`
          : 'Todavía no hay análisis.'}
      </span>
      <Button variant="ghost" size="sm" icon={RefreshCw} loading={refresh.isPending} onClick={() => void runNow()}>
        Analizar ahora
      </Button>
    </div>
  )
}

/**
 * An AI feature in the account (ADR 0014): status (activated by the
 * organization), thresholds and frequency. The account tunes them only when
 * the feature is active and the organization allows it; editing is local
 * until "Guardar". Settings the organization chose are the starting point.
 */
export function FeatureCard({ definition }: { definition: FeatureDefinition }) {
  const { feature } = useActiveKitchen()
  const state = feature(definition.key)
  const editable = Boolean(state?.canConfigure && state.usable)
  const saved = withDefaults(definition.key, state?.settings)
  const inherited = withDefaults(definition.key, state?.inheritedSettings)
  const customized = definition.fields.some((f) => saved[f.key] !== inherited[f.key])
  const update = useUpdateAiFeature()
  const { show } = useToast()

  const [edited, setEdited] = useState<AiSettings | null>(null)
  const form = edited ?? saved
  const errors = Object.fromEntries(definition.fields.map((f) => [f.key, settingError(f, form[f.key])]))
  const hasErrors = Object.values(errors).some(Boolean)

  function setSetting(key: string, value: number | boolean) {
    setEdited({ ...form, [key]: value })
  }

  async function save(settings: AiSettings) {
    try {
      await update.mutateAsync({ key: definition.key, settings })
      show(Object.keys(settings).length === 0 ? `${definition.title}: vuelve a los valores de la organización.` : `${definition.title}: guardado.`)
      setEdited(null)
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar la configuración'), 'error')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (hasErrors || !edited) return
    await save(edited)
  }

  return (
    <form onSubmit={handleSubmit} className={clsx('space-y-4 rounded-2xl border bg-neutral-900/60 p-5', state?.usable ? 'border-brasa-500/30' : 'border-neutral-800/60')}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={typography.h3}>{definition.title}</h3>
            {definition.usesModel ? (
              <Badge tone="brand" size="sm" icon={Sparkles}>
                IA
              </Badge>
            ) : (
              <Badge tone="neutral" size="sm" icon={Workflow}>
                Regla fija
              </Badge>
            )}
          </div>
          <p className={clsx('mt-1', typography.caption)}>{definition.description}</p>
          {state && <FeatureUnavailableNote state={state} className="mt-2" />}
          {state?.usable && !state.canConfigure && (
            <p className="mt-2 text-xs text-neutral-500">{state.accountOverride ? 'Tu rol no puede cambiar estos umbrales.' : 'Tu organización define estos umbrales para todas sus cuentas.'}</p>
          )}
        </div>
        {state && (
          <span className="shrink-0">
            <FeatureStatusBadge state={state} />
          </span>
        )}
      </div>

      {state?.usable && (
        <fieldset disabled={!editable || update.isPending} className="grid gap-3 sm:grid-cols-2">
          {definition.fields.map((field) =>
            field.type === 'boolean' ? (
              <label key={field.key} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800/60 px-3 py-2.5 text-sm text-neutral-300">
                {field.label}
                <Switch checked={form[field.key] === true} onChange={(v) => setSetting(field.key, v)} label={field.label} disabled={!editable} />
              </label>
            ) : (
              <div key={field.key}>
                <label className="block text-xs text-neutral-400" htmlFor={`${definition.key}-${field.key}`}>
                  {field.label}
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    id={`${definition.key}-${field.key}`}
                    type="number"
                    inputMode="numeric"
                    min={field.min}
                    max={field.max}
                    value={String(form[field.key])}
                    onChange={(e) => setSetting(field.key, e.target.value === '' ? Number.NaN : Number(e.target.value))}
                    aria-invalid={errors[field.key] ? true : undefined}
                    className="!mt-0 w-28"
                  />
                  {field.unit && <span className="text-xs text-neutral-500">{field.unit}</span>}
                </div>
                {errors[field.key] ? (
                  <p role="alert" className="mt-1 text-xs text-red-400">
                    {errors[field.key]}
                  </p>
                ) : (
                  field.hint && <p className={clsx('mt-1', typography.caption)}>{field.hint}</p>
                )}
              </div>
            ),
          )}
        </fieldset>
      )}

      {editable && (edited || customized) && (
        <div className="flex flex-wrap justify-end gap-2">
          {!edited && customized && (
            <Button variant="ghost" size="sm" onClick={() => void save({})} loading={update.isPending}>
              Usar los valores de la organización
            </Button>
          )}
          {edited && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEdited(null)} disabled={update.isPending}>
                Descartar
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={update.isPending} disabled={hasErrors}>
                Guardar
              </Button>
            </>
          )}
        </div>
      )}

      {definition.usesModel && state?.usable && <LastRun feature={definition.key as AiInsightFeatureKey} />}
    </form>
  )
}
