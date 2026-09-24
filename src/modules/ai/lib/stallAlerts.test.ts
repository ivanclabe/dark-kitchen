import { describe, expect, it } from 'vitest'
import type { KitchenSignalOrder, KitchenSignals } from '../types'
import { currentStalls, dueStallAnnouncement, spokenMinutes } from './stallAlerts'

function order(partial: Partial<KitchenSignalOrder>): KitchenSignalOrder {
  return {
    orderId: 'o1',
    orderNumber: 2040,
    status: 'EN_PREPARACION',
    priority: 0,
    minutesSinceCreated: 30,
    minutesInStatus: 25,
    alertMin: 20,
    late: true,
    stalled: false,
    items: [],
    ...partial,
  }
}

const signals = (orders: KitchenSignalOrder[]): KitchenSignals => ({ generatedAt: '', ridersActive: 1, orders })

describe('spokenMinutes', () => {
  it('habla minutos y horas', () => {
    expect(spokenMinutes(1)).toBe('1 minuto')
    expect(spokenMinutes(14)).toBe('14 minutos')
    expect(spokenMinutes(60)).toBe('1 hora')
    expect(spokenMinutes(161)).toBe('2 horas y 41 minutos')
  })
})

describe('currentStalls', () => {
  it('nombra los platos detenidos en vez del pedido', () => {
    const stalls = currentStalls(
      signals([
        order({
          stalled: true,
          items: [
            { itemId: 'i1', product: 'Burger', quantity: 1, kitchenStatus: 'EN_PREPARACION', minutesInStatus: 15, stalled: true },
            { itemId: 'i2', product: 'Papas', quantity: 1, kitchenStatus: 'LISTO', minutesInStatus: 2, stalled: false },
          ],
        }),
      ]),
    )
    expect(stalls).toEqual([expect.objectContaining({ key: 'dish:i1:EN_PREPARACION', message: 'Pedido 2040: Burger lleva 15 minutos en preparación' })])
  })

  it('plato pendiente mientras el pedido ya arrancó: "sin empezar"', () => {
    const stalls = currentStalls(signals([order({ items: [{ itemId: 'i3', product: 'Wrap', quantity: 1, kitchenStatus: 'PENDIENTE', minutesInStatus: 13, stalled: true }] })]))
    expect(stalls[0].message).toBe('Pedido 2040: Wrap lleva 13 minutos sin empezar')
    expect(stalls[0].short).toBe('Wrap · 13 min sin empezar')
  })

  it('pedido detenido sin platos detenidos: aviso por pedido según su estado', () => {
    const stalls = currentStalls(signals([order({ status: 'LISTO', stalled: true, minutesInStatus: 18 })]))
    expect(stalls).toEqual([expect.objectContaining({ key: 'order:o1:LISTO', message: 'Pedido 2040 lleva 18 minutos listo sin despachar' })])
  })

  it('nada detenido: sin avisos', () => {
    expect(currentStalls(signals([order({ stalled: false })]))).toEqual([])
  })
})

describe('dueStallAnnouncement', () => {
  const a = { key: 'a', orderId: 'o1', orderNumber: 1, message: 'Pedido 1 lleva 20 minutos en cola', short: '' }
  const b = { key: 'b', orderId: 'o2', orderNumber: 2, message: 'Pedido 2 lleva 25 minutos en cola', short: '' }
  const T = 1_000_000

  it('avisa lo nuevo y lo registra', () => {
    const result = dueStallAnnouncement([a], new Map(), T, 5)
    expect(result.text).toBe('Atención. Pedido 1 lleva 20 minutos en cola.')
    expect(result.next.get('a')).toBe(T)
  })

  it('no repite antes del intervalo, sí después', () => {
    const last = new Map([['a', T]])
    expect(dueStallAnnouncement([a], last, T + 4 * 60_000, 5).text).toBeNull()
    expect(dueStallAnnouncement([a], last, T + 5 * 60_000, 5).text).not.toBeNull()
  })

  it('olvida las detenciones que ya se resolvieron', () => {
    const result = dueStallAnnouncement([b], new Map([['a', T]]), T + 60_000, 5)
    expect(result.next.has('a')).toBe(false)
    expect(result.next.has('b')).toBe(true)
  })

  it('resume cuando hay más de tres avisos a la vez', () => {
    const many = [1, 2, 3, 4, 5].map((n) => ({ key: `k${n}`, orderId: `o${n}`, orderNumber: n, message: `Pedido ${n} detenido`, short: '' }))
    const { text } = dueStallAnnouncement(many, new Map(), T, 5)
    expect(text).toBe('Atención. Pedido 1 detenido. Pedido 2 detenido. Pedido 3 detenido. Y 2 avisos más en el tablero.')
  })
})
