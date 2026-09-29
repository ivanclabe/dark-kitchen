import { AI_FEATURES } from '@/modules/ai/lib/catalog'
import type { FeatureSettings } from '@/shared/features/features'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Drawer } from '@/shared/ui/Drawer'
import { Input, Select } from '@/shared/ui/FormField'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDateTime } from '@/shared/utils/format'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { PLATFORM_AI_KEY, setPlatformFeature, type PlatformFeature, type PlatformModel } from './api'

function fieldMeta(featureKey: string, settingKey: string): { label: string; unit?: string } {
  const field = AI_FEATURES.find((f) => f.key === featureKey)?.fields.find((f) => f.key === settingKey)
  return field ? { label: field.label, unit: field.unit } : { label: settingKey }
}

/**
 * One feature at platform level: global switch, model, minimum interval,
 * default settings (within its ranges), dependencies and recent errors.
 * The voice default is edited in the Voice tab.
 */
export function FeatureDrawer({
  feature,
  models,
  labelOf,
  onClose,
}: {
  feature: PlatformFeature
  models: PlatformModel[]
  labelOf: (key: string) => string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const [modelKey, setModelKey] = useState(feature.modelKey ?? '')
  const [intervalText, setIntervalText] = useState(feature.minIntervalSeconds === null ? '' : String(feature.minIntervalSeconds))
  const [defaults, setDefaults] = useState<FeatureSettings>(feature.defaultSettings)
  const editableDefaults = feature.key !== 'voice_speech' ? Object.entries(feature.settingsSchema) : []

  const save = useMutation({
    mutationFn: (change: Parameters<typeof setPlatformFeature>[1]) => setPlatformFeature(feature.key, change),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PLATFORM_AI_KEY })
      show(`${feature.label}: guardado.`)
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar'), 'error'),
  })

  const intervalNumber = intervalText.trim() === '' ? null : Number(intervalText)
  const intervalError = intervalNumber !== null && (!Number.isInteger(intervalNumber) || intervalNumber < 30 || intervalNumber > 86_400) ? 'Entre 30 y 86.400 segundos' : null

  return (
    <Drawer open onClose={onClose} title={feature.label} subtitle={feature.description}>
      <div className="space-y-6">
        <section className="flex items-start justify-between gap-4 rounded-2xl border border-neutral-800/60 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-100">Encendida en la plataforma</p>
            <p className={typography.caption}>Si la apagas, ninguna organización ni cuenta la usa. Su configuración se conserva y vuelve igual al encenderla.</p>
          </div>
          <Switch checked={feature.active} onChange={(active) => save.mutate({ active })} label={`${feature.label} en la plataforma`} disabled={save.isPending} />
        </section>

        {feature.issues.length > 0 && (
          <ul className="space-y-1 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            {feature.issues.map((issue) => (
              <li key={issue} className="flex gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {issue}
              </li>
            ))}
          </ul>
        )}

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-neutral-500">Planes que la incluyen</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {feature.plans.length === 0 ? '—' : feature.plans.map((p) => <Badge key={p} size="sm">{p}</Badge>)}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Uso</dt>
            <dd className="mt-1 text-neutral-200">
              {feature.organizationsOffering} de {feature.organizationsTotal} organizaciones · {feature.accountsEnabled} de {feature.accountsTotal} cuentas
            </dd>
          </div>
          {feature.dependsOn.length > 0 && (
            <div className="col-span-2">
              <dt className="text-neutral-500">Depende de</dt>
              <dd className="mt-1 text-neutral-200">{feature.dependsOn.map(labelOf).join(', ')} (para hablar)</dd>
            </div>
          )}
        </dl>

        {feature.usesModel && (
          <section className="space-y-4 rounded-2xl border border-neutral-800/60 p-4">
            <h3 className={typography.h3}>Modelo y frecuencia</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="feature-model" className="text-xs text-neutral-400">
                  Modelo
                </label>
                <Select id="feature-model" value={modelKey} onChange={(e) => setModelKey(e.target.value)} className="!mt-1">
                  {!feature.modelKey && <option value="">Sin modelo</option>}
                  {models
                    .filter((m) => m.active || m.key === feature.modelKey)
                    .map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label} ({m.key})
                      </option>
                    ))}
                </Select>
              </div>
              <div>
                <label htmlFor="feature-interval" className="text-xs text-neutral-400">
                  Intervalo mínimo entre análisis (s)
                </label>
                <Input id="feature-interval" type="number" inputMode="numeric" value={intervalText} placeholder="El del plan" onChange={(e) => setIntervalText(e.target.value)} className="!mt-1" aria-invalid={intervalError ? true : undefined} />
                <p className={intervalError ? 'mt-1 text-xs text-red-400' : `mt-1 ${typography.caption}`}>{intervalError ?? 'Vacío = el del plan (120 s por defecto).'}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                loading={save.isPending}
                disabled={Boolean(intervalError) || (modelKey === (feature.modelKey ?? '') && intervalNumber === feature.minIntervalSeconds)}
                onClick={() => save.mutate({ ...(modelKey && modelKey !== feature.modelKey ? { modelKey } : {}), minIntervalSeconds: intervalNumber })}
              >
                Guardar modelo y frecuencia
              </Button>
            </div>
          </section>
        )}

        {editableDefaults.length > 0 && (
          <section className="space-y-4 rounded-2xl border border-neutral-800/60 p-4">
            <div>
              <h3 className={typography.h3}>Valores por defecto</h3>
              <p className={typography.caption}>Punto de partida de todas las cuentas. Cada organización y cuenta puede ajustarlos dentro de los rangos.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {editableDefaults.map(([key, rule]) => {
                const meta = fieldMeta(feature.key, key)
                const value = defaults[key]
                if (rule.type === 'boolean') {
                  return (
                    <label key={key} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800/60 px-3 py-2.5 text-sm text-neutral-300">
                      {meta.label}
                      <Switch checked={value === true} onChange={(v) => setDefaults({ ...defaults, [key]: v })} label={meta.label} />
                    </label>
                  )
                }
                return (
                  <div key={key}>
                    <label htmlFor={`default-${key}`} className="text-xs text-neutral-400">
                      {meta.label}
                      {meta.unit ? ` (${meta.unit})` : ''}
                    </label>
                    <Input
                      id={`default-${key}`}
                      type="number"
                      min={rule.min}
                      max={rule.max}
                      value={String(value ?? '')}
                      onChange={(e) => setDefaults({ ...defaults, [key]: Number(e.target.value) })}
                      className="!mt-1"
                    />
                    <p className={typography.caption}>
                      Rango: {rule.min ?? '—'} a {rule.max ?? '—'}
                    </p>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-end">
              <Button variant="primary" size="sm" loading={save.isPending} onClick={() => save.mutate({ defaultSettings: defaults })}>
                Guardar valores por defecto
              </Button>
            </div>
          </section>
        )}
        {feature.key === 'voice_speech' && <p className={typography.small}>La voz por defecto de la plataforma se configura en la pestaña Voz.</p>}

        <section className="space-y-1">
          <h3 className={typography.h3}>Errores recientes</h3>
          {feature.lastError ? (
            <p className="text-sm text-red-300">
              {formatDateTime(feature.lastError.at)} · {feature.lastError.account}: {feature.lastError.message ?? 'sin detalle'}
            </p>
          ) : (
            <p className={typography.caption}>Sin errores en los últimos 7 días.</p>
          )}
          <p className={typography.caption}>Errores en 24 h: {feature.errors24h}</p>
        </section>
      </div>
    </Drawer>
  )
}
