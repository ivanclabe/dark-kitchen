import type { Order } from '@/modules/orders/types'
import type { SpokenText } from '@/shared/voice/hooks'
import { kitchenPhrases } from '@/shared/voice/kitchenPhrases'
import type { RecognizerId } from '@/shared/voice/recognition/preference'
import { parseVoiceCommand, type VoiceAction } from './commandParser'
import { spokenNumbersToDigits } from './spokenNumbers'

export type KitchenDecision =
  | { kind: 'reply'; message: string; spoken: SpokenText }
  | { kind: 'run'; action: Exclude<VoiceAction, 'CONFIRM'>; order: Order; code: string }

export const ACTION_FEEDBACK: Record<VoiceAction, string> = {
  CONFIRM: 'confirmado',
  START_PREPARATION: 'en preparación',
  MARK_READY: 'listo',
  CANCEL: 'cancelado',
  SET_PRIORITY: 'marcado como prioritario',
  UNSET_PRIORITY: 'ya no es prioritario',
}

/**
 * Is this phrase a kitchen command (ADR 0033: the router asks before Copilot)?
 * Only with an order number AND an action — «¿qué pedidos están listos?» is a
 * question for Copilot, «pedido 1042 listo» is a command.
 */
export function isKitchenCommand(transcript: string): boolean {
  return parseVoiceCommand(spokenNumbersToDigits(transcript)).confidence === 'high'
}

/**
 * The kitchen's decision for a spoken command (ADR 0015 to 0017, unchanged by
 * ADR 0033: the same parser, the same checks, the same words). Pure: what to
 * run on which order, or what to answer.
 */
export function decideKitchenCommand(transcript: string, orders: readonly Order[] | undefined, engine: RecognizerId): KitchenDecision {
  // Offline engines return numbers as words ("dos mil cuarenta"); digits pass through unchanged.
  const parsed = parseVoiceCommand(spokenNumbersToDigits(transcript))

  if (parsed.confidence !== 'high' || !parsed.orderCode || !parsed.action) {
    return { kind: 'reply', message: 'No entendí el comando.', spoken: (v) => kitchenPhrases.notUnderstood(v) }
  }

  // Offline recognition (beta, ADR 0015) can mishear a digit and name another
  // order with full confidence; cancelling is the one action that is hard to
  // undo, so with that engine it is done from the screen.
  if (parsed.action === 'CANCEL' && engine === 'vosk') {
    return { kind: 'reply', message: 'Con el reconocimiento sin internet, los pedidos se cancelan desde la pantalla.', spoken: 'Cancela desde la pantalla.' }
  }

  const code = parsed.orderCode
  const order = orders?.find((t) => t.orderNumber === Number(code))
  if (!order) {
    return { kind: 'reply', message: `El pedido ${code} no existe.`, spoken: (v) => kitchenPhrases.orderNotFound(code, v) }
  }

  // Already in that state: same checks as before, spoken without extra words.
  const already = (stateWord: string): KitchenDecision => ({
    kind: 'reply',
    message: `El pedido ${code} ya está ${stateWord}.`,
    spoken: (v) => kitchenPhrases.alreadyInState(code, stateWord, v),
  })

  switch (parsed.action) {
    case 'CONFIRM':
      return already('confirmado')
    case 'START_PREPARATION':
      return order.items.some((item) => item.kitchenStatus === 'PENDIENTE') ? { kind: 'run', action: 'START_PREPARATION', order, code } : already('en preparación')
    case 'MARK_READY':
      return order.items.some((item) => item.kitchenStatus !== 'LISTO') ? { kind: 'run', action: 'MARK_READY', order, code } : already('listo')
    default:
      return { kind: 'run', action: parsed.action, order, code }
  }
}
