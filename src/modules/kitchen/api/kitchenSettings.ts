import { getActiveKitchenId } from '@/shared/kitchen/activeKitchen'
import { supabase } from '@/shared/lib/supabase'
import type { SlaThresholds } from '../lib/ticketVisuals'

interface SlaSettingsRow {
  confirmado_alert_min: number
  en_preparacion_alert_min: number
  listo_alert_min: number
  near_threshold_pct: number
}

function mapRow(row: SlaSettingsRow): SlaThresholds {
  return {
    confirmadoAlertMin: row.confirmado_alert_min,
    enPreparacionAlertMin: row.en_preparacion_alert_min,
    listoAlertMin: row.listo_alert_min,
    nearThresholdPct: row.near_threshold_pct,
  }
}

/** Una fila por Cocina (clave kitchen_id desde multi-cocina, ADR 0007). */
export async function getKitchenSlaSettings(): Promise<SlaThresholds> {
  const { data, error } = await supabase
    .from('dk_kitchen_sla_settings')
    .select('confirmado_alert_min, en_preparacion_alert_min, listo_alert_min, near_threshold_pct')
    .eq('kitchen_id', getActiveKitchenId() ?? '')
    .single()

  if (error) throw error
  return mapRow(data as unknown as SlaSettingsRow)
}

export async function updateKitchenSlaSettings(thresholds: SlaThresholds): Promise<void> {
  const { error } = await supabase
    .from('dk_kitchen_sla_settings')
    .update({
      confirmado_alert_min: thresholds.confirmadoAlertMin,
      en_preparacion_alert_min: thresholds.enPreparacionAlertMin,
      listo_alert_min: thresholds.listoAlertMin,
      near_threshold_pct: thresholds.nearThresholdPct,
    })
    .eq('kitchen_id', getActiveKitchenId() ?? '')

  if (error) throw error
}
