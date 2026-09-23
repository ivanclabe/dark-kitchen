import { Button } from '@/shared/ui/Button'
import { FormActions, FormField, Input } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useState, type FormEvent } from 'react'
import { useKitchenSlaSettings, useUpdateKitchenSlaSettings } from '../../hooks/useKitchenSettings'
import { DEFAULT_SLA_THRESHOLDS, type SlaThresholds } from '../../lib/ticketVisuals'

/** Umbrales de alerta (SLA) por estado — el formulario que antes vivía en su propio modal. */
export function SlaSettingsPanel({ canEdit }: { canEdit: boolean }) {
  const { data: saved } = useKitchenSlaSettings()
  const update = useUpdateKitchenSlaSettings()
  const { show } = useToast()

  // Derivado de `saved` mientras no haya edición local, sin efecto de sincronización.
  const [edited, setEdited] = useState<SlaThresholds | null>(null)
  const form = edited ?? saved ?? DEFAULT_SLA_THRESHOLDS

  function setField(field: keyof SlaThresholds, value: string) {
    const parsed = Number(value)
    if (Number.isNaN(parsed)) return
    setEdited({ ...form, [field]: parsed })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await update.mutateAsync(form)
      show('Configuración de SLA actualizada.')
      setEdited(null)
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar la configuración'), 'error')
    }
  }

  const field = (key: keyof SlaThresholds, props: { min: number; max?: number }) => (a11y: Parameters<Parameters<typeof FormField>[0]['children']>[0]) => (
    <Input {...a11y} {...props} type="number" inputMode="numeric" required disabled={!canEdit} value={form[key]} onChange={(e) => setField(key, e.target.value)} />
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className={typography.small}>Minutos de espera antes de que un pedido se marque como atrasado en cada estado.</p>
      <FormField label="En cola" required>
        {field('confirmadoAlertMin', { min: 1 })}
      </FormField>
      <FormField label="Preparando" required>
        {field('enPreparacionAlertMin', { min: 1 })}
      </FormField>
      <FormField label="Listo (esperando despacho)" required>
        {field('listoAlertMin', { min: 1 })}
      </FormField>
      <FormField label='Umbral de "cerca del límite" (%)' required hint="Porcentaje del umbral a partir del cual el pedido se marca en ámbar.">
        {field('nearThresholdPct', { min: 1, max: 100 })}
      </FormField>

      {canEdit ? (
        <FormActions>
          {edited && (
            <Button variant="ghost" onClick={() => setEdited(null)} disabled={update.isPending}>
              Descartar cambios
            </Button>
          )}
          <Button type="submit" variant="primary" loading={update.isPending} disabled={!edited}>
            Guardar alertas
          </Button>
        </FormActions>
      ) : (
        <p className={typography.caption}>Solo un administrador o gerente puede cambiar las alertas.</p>
      )}
    </form>
  )
}
