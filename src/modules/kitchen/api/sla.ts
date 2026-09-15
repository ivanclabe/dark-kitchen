import { supabase } from '@/shared/lib/supabase'

export interface SlaSummary {
  totalCompleted: number
  withinSla: number
  overSla: number
  complianceRate: number
  avgPrepMinutes: number
  maxPrepMinutes: number
}

const EMPTY_SUMMARY: SlaSummary = {
  totalCompleted: 0,
  withinSla: 0,
  overSla: 0,
  complianceRate: 100,
  avgPrepMinutes: 0,
  maxPrepMinutes: 0,
}

/**
 * Tiempo de preparación real = CONFIRMADO → LISTO, calculado a partir de
 * dk_order_status_history (ya existía, registra cada transición desde el
 * diseño original — no hace falta ninguna tabla ni columna nueva). Dos
 * consultas simples en vez de una sola con subquery: primero los pedidos
 * que llegaron a LISTO dentro del rango, después el momento en que esos
 * mismos pedidos fueron CONFIRMADO, y se cruzan en JS.
 */
/**
 * lateThresholdMin: umbral de tiempo total de preparación (CONFIRMADO →
 * LISTO) considerado "dentro de SLA". Antes era el TIME_LATE_MIN global
 * fijo; ahora lo calcula el caller (useSlaSummary) a partir de los
 * umbrales configurables por estado — confirmadoAlertMin +
 * enPreparacionAlertMin, la suma de ambas etapas que cubre este tramo.
 */
export async function getSlaSummary(rangeStart: Date, lateThresholdMin: number): Promise<SlaSummary> {
  const { data: listoRows, error: listoError } = await supabase
    .from('dk_order_status_history')
    .select('order_id, changed_at')
    .eq('to_status', 'LISTO')
    .gte('changed_at', rangeStart.toISOString())

  if (listoError) throw listoError
  if (!listoRows || listoRows.length === 0) return EMPTY_SUMMARY

  const orderIds = listoRows.map((row) => row.order_id)
  const { data: confirmedRows, error: confirmedError } = await supabase
    .from('dk_order_status_history')
    .select('order_id, changed_at')
    .eq('to_status', 'CONFIRMADO')
    .in('order_id', orderIds)

  if (confirmedError) throw confirmedError

  const confirmedAtByOrder = new Map(confirmedRows?.map((row) => [row.order_id, row.changed_at]) ?? [])

  const prepMinutes: number[] = []
  for (const row of listoRows) {
    const confirmedAt = confirmedAtByOrder.get(row.order_id)
    if (!confirmedAt) continue
    const minutes = (new Date(row.changed_at).getTime() - new Date(confirmedAt).getTime()) / 60_000
    if (minutes >= 0) prepMinutes.push(minutes)
  }

  const totalCompleted = prepMinutes.length
  if (totalCompleted === 0) return EMPTY_SUMMARY

  const withinSla = prepMinutes.filter((minutes) => minutes <= lateThresholdMin).length
  const overSla = totalCompleted - withinSla

  return {
    totalCompleted,
    withinSla,
    overSla,
    complianceRate: Math.round((withinSla / totalCompleted) * 100),
    avgPrepMinutes: Math.round(prepMinutes.reduce((sum, minutes) => sum + minutes, 0) / totalCompleted),
    maxPrepMinutes: Math.round(Math.max(...prepMinutes)),
  }
}
