import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/shared/ui/formClasses'
import { getErrorMessage } from '@/shared/utils/errors'
import { useState, type FormEvent } from 'react'
import { useKitchenSlaSettings, useUpdateKitchenSlaSettings } from '../hooks/useKitchenSettings'
import { DEFAULT_SLA_THRESHOLDS, type SlaThresholds } from '../lib/ticketVisuals'

/**
 * Panel de configuración de umbrales de alerta/SLA por estado. No existía
 * ningún módulo de configuración en la app — esto es lo mínimo necesario:
 * un modal sobre la tabla dk_kitchen_sla_settings (fila única), sin ruta
 * ni módulo nuevo. Gateado a ADMIN/MANAGER por el caller (KitchenPage);
 * la RLS de la tabla es la barrera real.
 */
export function KitchenSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: saved } = useKitchenSlaSettings()
  const update = useUpdateKitchenSlaSettings()
  const { show } = useToast()

  // Se deriva de `saved` en vez de sincronizarse por efecto: mientras no haya
  // edición local (`edited === null`) el formulario refleja directamente lo
  // cargado. `handleClose` descarta la edición sin guardar al cerrar.
  const [edited, setEdited] = useState<SlaThresholds | null>(null)
  const form = edited ?? saved ?? DEFAULT_SLA_THRESHOLDS

  function setField(field: keyof SlaThresholds, value: string) {
    const parsed = Number(value)
    if (Number.isNaN(parsed)) return
    setEdited({ ...form, [field]: parsed })
  }

  function handleClose() {
    setEdited(null)
    onClose()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await update.mutateAsync(form)
      show('Configuración de SLA actualizada.')
      handleClose()
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar la configuración'), 'error')
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Umbrales de alerta (SLA)">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-neutral-500">
          Minutos de espera antes de que un pedido se marque como "fuera de SLA" en cada estado. "Cerca del límite" se
          calcula como un porcentaje de ese umbral.
        </p>

        <div>
          <label className={labelClass}>Confirmado</label>
          <input
            type="number"
            min={1}
            value={form.confirmadoAlertMin}
            onChange={(e) => setField('confirmadoAlertMin', e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>En preparación</label>
          <input
            type="number"
            min={1}
            value={form.enPreparacionAlertMin}
            onChange={(e) => setField('enPreparacionAlertMin', e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Listo (esperando despacho)</label>
          <input
            type="number"
            min={1}
            value={form.listoAlertMin}
            onChange={(e) => setField('listoAlertMin', e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Umbral de "cerca del límite" (%)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={form.nearThresholdPct}
            onChange={(e) => setField('nearThresholdPct', e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={handleClose} className={secondaryButtonClass}>
            Cancelar
          </button>
          <button type="submit" disabled={update.isPending} className={primaryButtonClass}>
            {update.isPending ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
