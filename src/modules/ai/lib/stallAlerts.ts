import type { KitchenSignalOrder, KitchenSignals } from '../types'

export interface StallAlert {
  /** Identifica el aviso: cambia si el pedido/plato cambia de estado, así el aviso vuelve a sonar desde cero. */
  key: string
  orderId: string
  orderNumber: number
  /** Frase completa para la voz. */
  message: string
  /** Etiqueta corta para la tarjeta del tablero. */
  short: string
}

/** Máximo de pedidos que se nombran en una sola locución; el resto se resume. */
export const MAX_SPOKEN = 3

export function spokenMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} ${m === 1 ? 'minuto' : 'minutos'}`
  const h = Math.floor(m / 60)
  const rest = m % 60
  const hours = `${h} ${h === 1 ? 'hora' : 'horas'}`
  return rest === 0 ? hours : `${hours} y ${rest} ${rest === 1 ? 'minuto' : 'minutos'}`
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
        })
      }
    } else if (order.stalled) {
      alerts.push({
        key: `order:${order.orderId}:${order.status}`,
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        message: `Pedido ${order.orderNumber} lleva ${spokenMinutes(order.minutesInStatus)} ${ORDER_STATUS_PHRASE[order.status]}`,
        short: `${order.minutesInStatus} min sin avanzar`,
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
  const spoken = due.slice(0, MAX_SPOKEN).map((s) => s.message)
  const rest = due.length - spoken.length
  const tail = rest > 0 ? ` Y ${rest} ${rest === 1 ? 'aviso más' : 'avisos más'} en el tablero.` : ''
  return { text: `Atención. ${spoken.join('. ')}.${tail}`, due, next }
}
