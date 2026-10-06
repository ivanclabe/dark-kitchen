import { useAdvanceOrderItems, useCancelOrder, useSetOrderPriority } from '@/modules/orders/hooks/useOrders'
import type { Order } from '@/modules/orders/types'
import { useVoiceHandler } from '@/modules/voice/voiceContext'
import type { VoiceReply } from '@/modules/voice/types'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { kitchenPhrases } from '@/shared/voice/kitchenPhrases'
import { getErrorMessage } from '@/shared/utils/errors'
import { useEffect, useRef } from 'react'
import { commandGrammar } from './commandGrammar'
import { ACTION_FEEDBACK, decideKitchenCommand, isKitchenCommand } from './kitchenCommands'

const COMMAND_GRAMMAR = commandGrammar()

/**
 * The kitchen's voice commands (ADR 0015 to 0017), registered with «Oye
 * Quanela» while the Cocina view is open (ADR 0033). The same decision
 * (decideKitchenCommand), the same mutations as the buttons, the same words;
 * the microphone, the wake phrase and the voice are the app's now.
 */
export function useKitchenVoiceCommands(orders: Order[] | undefined) {
  const { canUseFeature } = useActiveKitchen()
  const enabled = canUseFeature('voice_commands')
  const ordersRef = useRef(orders)
  useEffect(() => {
    ordersRef.current = orders
  })
  const { advanceOrderItems } = useAdvanceOrderItems()
  const setPriority = useSetOrderPriority()
  const cancelOrder = useCancelOrder()

  useVoiceHandler(
    enabled
      ? {
          id: 'kitchen-commands',
          grammar: COMMAND_GRAMMAR,
          matches: isKitchenCommand,
          handle: async (text, { engine }): Promise<VoiceReply> => {
            const decision = decideKitchenCommand(text, ordersRef.current, engine)
            if (decision.kind === 'reply') return { tone: 'error', message: decision.message, spoken: decision.spoken, priority: 'command', toast: true }
            const { action, order, code } = decision
            try {
              switch (action) {
                case 'START_PREPARATION':
                  await advanceOrderItems(order.items, 'EN_PREPARACION')
                  break
                case 'MARK_READY':
                  await advanceOrderItems(order.items, 'LISTO')
                  break
                case 'CANCEL':
                  await cancelOrder.mutateAsync({ orderId: order.id })
                  break
                case 'SET_PRIORITY':
                  await setPriority.mutateAsync({ orderId: order.id, priority: 1 })
                  break
                case 'UNSET_PRIORITY':
                  await setPriority.mutateAsync({ orderId: order.id, priority: 0 })
                  break
              }
              return { tone: 'success', message: `Pedido ${code} ${ACTION_FEEDBACK[action]}.`, spoken: (v) => kitchenPhrases.commandDone(code, action, v), priority: 'command', toast: true }
            } catch (err) {
              return { tone: 'error', message: getErrorMessage(err, `No se pudo actualizar el pedido ${code}.`), spoken: (v) => kitchenPhrases.commandFailed(code, v), priority: 'command', toast: true }
            }
          },
        }
      : null,
  )
  return { enabled }
}
