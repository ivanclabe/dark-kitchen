import type { VoiceVerbosity } from './catalog'

/**
 * Everything the kitchen says, built from templates (no language model):
 * short, clear, natural and actionable (ADR 0014, 9.4). "minimal" is for
 * the Direct and Minimal styles.
 */
export type OrderVoiceAction = 'CONFIRM' | 'START_PREPARATION' | 'MARK_READY' | 'CANCEL' | 'SET_PRIORITY' | 'UNSET_PRIORITY'

const ACTION_WORD: Record<OrderVoiceAction, string> = {
  CONFIRM: 'confirmado',
  START_PREPARATION: 'en preparación',
  MARK_READY: 'listo',
  CANCEL: 'cancelado',
  SET_PRIORITY: 'prioritario',
  UNSET_PRIORITY: 'ya no es prioritario',
}

export const kitchenPhrases = {
  commandDone(order: string, action: OrderVoiceAction, v: VoiceVerbosity): string {
    return v === 'minimal' ? `${order} ${ACTION_WORD[action]}.` : `Pedido ${order} ${ACTION_WORD[action]}.`
  },
  notUnderstood(v: VoiceVerbosity): string {
    return v === 'minimal' ? '¿Perdón?' : 'No entendí.'
  },
  orderNotFound(order: string, v: VoiceVerbosity): string {
    return v === 'minimal' ? `${order} no existe.` : `Pedido ${order} no existe.`
  },
  /** "ya está confirmado / en preparación / listo". */
  alreadyInState(order: string, stateWord: string, v: VoiceVerbosity): string {
    return v === 'minimal' ? `${order} ya ${stateWord}.` : `Pedido ${order} ya está ${stateWord}.`
  },
  commandFailed(order: string, v: VoiceVerbosity): string {
    return v === 'minimal' ? `${order}: no se pudo.` : `No se pudo actualizar el pedido ${order}.`
  },
  insight(title: string, v: VoiceVerbosity): string {
    return v === 'minimal' ? 'Sugerencia en pantalla.' : `Sugerencia: ${title}.`
  },
}

/** A stalled order or dish, as the kitchen board computes it. */
export interface StallPhraseInput {
  orderNumber: string
  /** Dish name, or null when the whole order is stalled. */
  product: string | null
  minutes: number
  /** "sin empezar", "en preparación", "listo sin despachar"… */
  statusPhrase: string
}

export function spokenMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} ${m === 1 ? 'minuto' : 'minutos'}`
  const h = Math.floor(m / 60)
  const rest = m % 60
  const hours = `${h} ${h === 1 ? 'hora' : 'horas'}`
  return rest === 0 ? hours : `${hours} y ${rest} ${rest === 1 ? 'minuto' : 'minutos'}`
}

const COUNT_WORD = ['', 'Un', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez']

function stallLine(s: StallPhraseInput): string {
  return s.product ? `Pedido ${s.orderNumber}: ${s.product}, ${spokenMinutes(s.minutes)} ${s.statusPhrase}` : `Pedido ${s.orderNumber}: ${spokenMinutes(s.minutes)} ${s.statusPhrase}`
}

/**
 * Stall alerts. One: the full line. Several: how many and the oldest, so the
 * kitchen hears the count and where to look first.
 */
export function stallAnnouncement(stalls: readonly StallPhraseInput[], v: VoiceVerbosity): string | null {
  if (stalls.length === 0) return null
  const oldest = [...stalls].sort((a, b) => b.minutes - a.minutes)[0]
  // Counted by order: two stalled dishes of the same order are one order.
  const orders = new Set(stalls.map((s) => s.orderNumber)).size
  if (v === 'minimal') {
    return orders === 1 ? `${oldest.orderNumber}, ${spokenMinutes(oldest.minutes)}.` : `${orders} detenidos. ${oldest.orderNumber}, ${spokenMinutes(oldest.minutes)}.`
  }
  if (orders === 1) return `${stallLine(oldest)}.`
  const count = COUNT_WORD[orders] ?? String(orders)
  return `${count} pedidos detenidos. El más antiguo, ${stallLine(oldest).replace(/^Pedido /, '')}.`
}
