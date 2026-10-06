import { describe, expect, it } from 'vitest'
import { routeUtterance, stripWakePhrase } from './router'
import type { VoiceHandler } from './types'

const kitchen: VoiceHandler = { id: 'kitchen', grammar: '["pedido"]', matches: (t) => /\d{4}/.test(t) && /listo/.test(t), handle: async () => null }
const copilot: VoiceHandler = { id: 'copilot', fallback: true, handle: async () => null }
const id = (r: ReturnType<typeof routeUtterance>) => (r.kind === 'handler' ? r.handler.id : r.kind === 'none' ? `none:${r.reason}` : r.kind)

describe('«Oye Quanela» routes each phrase (ADR 0033)', () => {
  it('in Cocina: a command to the kitchen, a question to Copilot', () => {
    expect(id(routeUtterance('pedido 1042 listo', [kitchen, copilot], 'browser'))).toBe('kitchen')
    expect(id(routeUtterance('¿cuánto vendimos hoy?', [kitchen, copilot], 'browser'))).toBe('copilot')
  })

  it('outside Cocina a command is never executed: it goes to Copilot (which says where)', () => {
    expect(id(routeUtterance('pedido 1042 listo', [copilot], 'browser'))).toBe('copilot')
  })

  it('«cancela» alone stops; «cancela el pedido 1042» is not that', () => {
    expect(id(routeUtterance('Cancela.', [kitchen, copilot], 'browser'))).toBe('stop')
    expect(id(routeUtterance('cancela el pedido 1042', [copilot], 'browser'))).toBe('copilot')
  })

  it('the offline recognizer only serves the kitchen', () => {
    expect(id(routeUtterance('pedido 1042 listo', [kitchen, copilot], 'vosk'))).toBe('kitchen')
    expect(id(routeUtterance('cuánto vendimos', [copilot], 'vosk'))).toBe('none:offline-question')
  })

  it('the wake phrase that slips into the question is removed', () => {
    expect(stripWakePhrase('oye quanela cuánto vendimos hoy')).toBe('cuánto vendimos hoy')
    expect(stripWakePhrase('Oye, Juanela, ¿qué pedidos hay?')).toBe('¿qué pedidos hay?')
    expect(stripWakePhrase('oye cuanela oye guanela pedido 1042 listo')).toBe('pedido 1042 listo')
    expect(stripWakePhrase('oye quanela')).toBe('')
    expect(stripWakePhrase('cuánto vendimos hoy')).toBe('cuánto vendimos hoy')
    expect(stripWakePhrase('pedido de ana pérez')).toBe('pedido de ana pérez')
    expect(stripWakePhrase('canela queda poca')).toBe('canela queda poca')
  })

  it('nothing heard, or nobody to answer', () => {
    expect(id(routeUtterance('  ', [copilot], 'browser'))).toBe('none:empty')
    expect(id(routeUtterance('hola', [], 'browser'))).toBe('none:no-handler')
  })
})
