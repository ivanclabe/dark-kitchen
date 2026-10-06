import { describe, expect, it } from 'vitest'
import type { Order, OrderItem } from '@/modules/orders/types'
import { decideKitchenCommand, isKitchenCommand } from './kitchenCommands'

// ADR 0033: the kitchen's voice commands moved out of the kitchen's microphone, NOT their logic.
// These cases pin down what the old engine decided and said, word for word.
const item = (kitchenStatus: OrderItem['kitchenStatus']): OrderItem => ({ id: 'i', productId: 'p', productName: 'Sopa', quantity: 1, unitPrice: 1, lineTotal: 1, observation: null, kitchenStatus })
const order = (orderNumber: number, ...items: OrderItem[]): Order =>
  ({ id: `o${orderNumber}`, orderNumber, items, status: 'CONFIRMADO' }) as unknown as Order
const orders = [order(1042, item('PENDIENTE'), item('EN_PREPARACION')), order(2040, item('LISTO')), order(3001, item('EN_PREPARACION'))]
const spoken = (d: ReturnType<typeof decideKitchenCommand>) => (d.kind === 'reply' ? (typeof d.spoken === 'function' ? d.spoken('standard') : d.spoken) : null)

describe('kitchen voice commands (same behavior as before ADR 0033)', () => {
  it('runs: start, ready, cancel, priority — numbers in digits or words', () => {
    expect(decideKitchenCommand('pedido 1042 iniciar', orders, 'browser')).toMatchObject({ kind: 'run', action: 'START_PREPARATION', code: '1042' })
    expect(decideKitchenCommand('pedido mil cuarenta y dos listo', orders, 'browser')).toMatchObject({ kind: 'run', action: 'MARK_READY', code: '1042' })
    expect(decideKitchenCommand('cancelar pedido 1042', orders, 'browser')).toMatchObject({ kind: 'run', action: 'CANCEL' })
    expect(decideKitchenCommand('pedido 1042 prioritario', orders, 'browser')).toMatchObject({ kind: 'run', action: 'SET_PRIORITY' })
    expect(decideKitchenCommand('pedido 1042 quitar prioridad', orders, 'browser')).toMatchObject({ kind: 'run', action: 'UNSET_PRIORITY' })
  })

  it('does not understand without an order and an action', () => {
    const d = decideKitchenCommand('pedido 1042', orders, 'browser')
    expect(d).toMatchObject({ kind: 'reply', message: 'No entendí el comando.' })
    expect(spoken(d)).toBe('No entendí.')
  })

  it('an order that is not on the board', () => {
    const d = decideKitchenCommand('pedido 9999 listo', orders, 'browser')
    expect(d).toMatchObject({ kind: 'reply', message: 'El pedido 9999 no existe.' })
    expect(spoken(d)).toBe('Pedido 9999 no existe.')
  })

  it('already in that state', () => {
    expect(decideKitchenCommand('pedido 2040 listo', orders, 'browser')).toMatchObject({ message: 'El pedido 2040 ya está listo.' })
    expect(decideKitchenCommand('pedido 3001 iniciar', orders, 'browser')).toMatchObject({ message: 'El pedido 3001 ya está en preparación.' })
    expect(decideKitchenCommand('pedido 1042 confirmar', orders, 'browser')).toMatchObject({ message: 'El pedido 1042 ya está confirmado.' })
  })

  it('with the offline recognizer, cancelling is done from the screen', () => {
    expect(decideKitchenCommand('cancelar pedido 1042', orders, 'vosk')).toMatchObject({
      kind: 'reply',
      message: 'Con el reconocimiento sin internet, los pedidos se cancelan desde la pantalla.',
    })
  })

  it('a command needs an order number and an action (a question is not one)', () => {
    expect(isKitchenCommand('pedido 1042 listo')).toBe(true)
    expect(isKitchenCommand('¿qué pedidos están listos?')).toBe(false)
    expect(isKitchenCommand('¿cómo va el pedido 1042?')).toBe(false)
  })
})
