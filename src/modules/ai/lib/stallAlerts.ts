import type { VoiceVerbosity } from '@/shared/voice/catalog'
import { spokenMinutes, stallAnnouncement, type StallPhraseInput } from '@/shared/voice/kitchenPhrases'
import type { KitchenSignalOrder, KitchenSignals } from '../types'

export { spokenMinutes }

export interface StallAlert {
  /** Identifica el aviso: cambia si el pedido/plato cambia de estado, así el aviso vuelve a sonar desde cero. */
  key: string
  orderId: string
  orderNumber: number
  /** Frase completa (pantalla y registro). */
  message: string
  /** Etiqueta corta para la tarjeta del tablero. */
  short: string
  /** Datos para armar la frase hablada según el estilo de voz (ADR 0014). */
  speech: StallPhraseInput
}


const ORDER_STATUS_PHRASE: Record<KitchenSignalOrder['status'], string> = {
  CONFIRMADO: 'en cola',
  EN_PREPARACION: 'en preparación',
  LISTO: 'listo sin despachar',
}

/**
 * Qué está detenido ahora, según dk_kitchen_signals (la regla vive en SQL:
 * pedido más tiempo que su umbral SLA en el estado actual; plato más de
 * dish_stall_min sin avanzar). Si un pedido tiene platos detenidos se
 * nombran los platos — es más accionable que "el pedido está detenido".
 */
export function currentStalls(signals: KitchenSignals): StallAlert[] {
  const alerts: StallAlert[] = []
  for (const order of signals.orders) {
    const stalledItems = order.items.filter((i) => i.stalled)
    if (stalledItems.length > 0) {
      for (const item of stalledItems) {
        const phrase = item.kitchenStatus === 'PENDIENTE' ? 'sin empezar' : 'en preparación'
        alerts.push({
          key: `dish:${item.itemId}:${item.kitchenStatus}`,
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          message: `Pedido ${order.orderNumber}: ${item.product} lleva ${spokenMinutes(item.minutesInStatus)} ${phrase}`,
          short: `${item.product} · ${item.minutesInStatus} min ${phrase}`,
          speech: { orderNumber: String(order.orderNumber), product: item.product, minutes: item.minutesInStatus, statusPhrase: phrase },
        })
      }
    } else if (order.stalled) {
      alerts.push({
        key: `order:${order.orderId}:${order.status}`,
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        message: `Pedido ${order.orderNumber} lleva ${spokenMinutes(order.minutesInStatus)} ${ORDER_STATUS_PHRASE[order.status]}`,
        short: `${order.minutesInStatus} min sin avanzar`,
        speech: { orderNumber: String(order.orderNumber), product: null, minutes: order.minutesInStatus, statusPhrase: ORDER_STATUS_PHRASE[order.status] },
      })
    }
  }
  return alerts
}

/**
 * Decide qué avisar ahora sin repetir: cada detención suena una vez y
 * vuelve a sonar solo pasados `repeatMin` minutos. Devuelve el texto a decir
 * (o null) y el nuevo registro de últimos avisos — sin claves de detenciones
 * que ya se resolvieron, para que no crezca sin fin.
 */
export function dueStallAnnouncement(
  stalls: StallAlert[],
  lastAnnounced: ReadonlyMap<string, number>,
  now: number,
  repeatMin: number,
  verbosity: VoiceVerbosity = 'standard',
): { text: string | null; due: StallAlert[]; next: Map<string, number> } {
  const next = new Map<string, number>()
  for (const s of stalls) {
    const last = lastAnnounced.get(s.key)
    if (last !== undefined) next.set(s.key, last)
  }

  const due = stalls.filter((s) => {
    const last = lastAnnounced.get(s.key)
    return last === undefined || now - last >= repeatMin * 60_000
  })
  if (due.length === 0) return { text: null, due, next }

  for (const s of due) next.set(s.key, now)
  // One short phrase: the stall, or how many and the oldest (ADR 0014, 9.4).
  return { text: stallAnnouncement(due.map((s) => s.speech), verbosity), due, next }
}
