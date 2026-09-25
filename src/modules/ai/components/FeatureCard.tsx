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
import { useLatestAiInsight, useRefreshAiInsight, useUpdateAiFeature } from '../hooks/useAi'
import { settingError, withDefaults, type FeatureDefinition } from '../lib/catalog'
import type { AiInsightFeatureKey, AiSettings } from '../types'

function LastRun({ feature }: { feature: AiInsightFeatureKey }) {
  const { data: last } = useLatestAiInsight(feature)
  const refresh = useRefreshAiInsight(feature)
  const { show } = useToast()

  async function runNow() {
    const result = await refresh.mutateAsync()
    if (result.kind === 'ok') show(result.insight.status === 'empty' ? 'Análisis listo: no hay nada que señalar.' : `Análisis listo: ${result.insight.items.length} recomendaciones.`)
    else if (result.kind === 'not_configured') show('La IA no está conectada: falta el secreto DK_ANTHROPIC_API_KEY.', 'error')
    else if (result.kind === 'disabled') show('Activa la función y guarda antes de probarla.', 'error')
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
 * Tarjeta de una función de IA en la Cuenta: interruptor, umbrales y
 * frecuencia. La edición es local hasta "Guardar" (mismo patrón derivado que
 * el resto de formularios de configuración: sin efecto de sincronización).
 * Si la organización no la ofrece, no se puede activar (ADR 0009); lo que la
 * Cuenta tenía guardado se conserva.
 */
export function FeatureCard({ definition }: { definition: FeatureDefinition }) {
  const { feature } = useActiveKitchen()
  const state = feature(definition.key)
  const available = state?.available ?? false
  const canManage = state?.canManage ?? false
  const saved = { enabled: state?.enabled ?? false, settings: withDefaults(definition.key, state?.settings) }
  const update = useUpdateAiFeature()
  const { show } = useToast()

  const [edited, setEdited] = useState<{ enabled: boolean; settings: AiSettings } | null>(null)
  const form = edited ?? { enabled: saved.enabled, settings: saved.settings }
  const errors = Object.fromEntries(definition.fields.map((f) => [f.key, settingError(f, form.settings[f.key])]))
  const hasErrors = Object.values(errors).some(Boolean)

  function setSetting(key: string, value: number | boolean) {
    setEdited({ ...form, settings: { ...form.settings, [key]: value } })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (hasErrors) return
    try {
      await update.mutateAsync({ key: definition.key, enabled: form.enabled, settings: form.settings })
      show(`${definition.title}: ${form.enabled ? 'activada' : 'desactivada'}.`)
      setEdited(null)
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar la configuración'), 'error')
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={clsx('space-y-4 rounded-2xl border bg-neutral-900/60 p-5', form.enabled && available ? 'border-brasa-500/30' : 'border-neutral-800/60')}
    >
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
          {!available && (
            <p className="mt-2 text-xs text-amber-300">
              Tu organización no tiene disponible esta función{saved.enabled ? ': queda apagada, con su configuración guardada.' : '.'}
            </p>
          )}
        </div>
        <span className={clsx('shrink-0', !available && 'opacity-50')}>
          <Switch
            checked={form.enabled}
            onChange={(enabled) => setEdited({ ...form, enabled })}
            label={`Activar ${definition.title}`}
            disabled={!canManage || (!available && !form.enabled)}
          />
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {definition.fields.map((field) =>
          field.type === 'boolean' ? (
            <label key={field.key} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800/60 px-3 py-2.5 text-sm text-neutral-300">
              {field.label}
              <Switch checked={form.settings[field.key] === true} onChange={(v) => setSetting(field.key, v)} label={field.label} />
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
                  value={String(form.settings[field.key])}
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
      </div>

      {edited && (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEdited(null)} disabled={update.isPending}>
            Descartar
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={update.isPending} disabled={hasErrors}>
            Guardar
          </Button>
        </div>
      )}

      {definition.usesModel && state?.usable && <LastRun feature={definition.key as AiInsightFeatureKey} />}
    </form>
  )
}
