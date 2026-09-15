import { describe, expect, it } from 'vitest'
import { parseVoiceCommand } from './commandParser'

describe('parseVoiceCommand', () => {
  it('reconoce un comando estructurado válido', () => {
    const result = parseVoiceCommand('Pedido 2040 en preparación')
    expect(result).toEqual({
      orderCode: '2040',
      action: 'START_PREPARATION',
      confidence: 'high',
      rawTranscript: 'Pedido 2040 en preparación',
    })
  })

  it('reconoce la variante sin la palabra "pedido"', () => {
    const result = parseVoiceCommand('2040 en preparación')
    expect(result.orderCode).toBe('2040')
    expect(result.action).toBe('START_PREPARATION')
    expect(result.confidence).toBe('high')
  })

  it('reconoce la variante con coma', () => {
    const result = parseVoiceCommand('Pedido 2040, listo')
    expect(result.orderCode).toBe('2040')
    expect(result.action).toBe('MARK_READY')
    expect(result.confidence).toBe('high')
  })

  it('es insensible a mayúsculas/minúsculas', () => {
    const result = parseVoiceCommand('PEDIDO 2040 LISTO')
    expect(result.action).toBe('MARK_READY')
    expect(result.confidence).toBe('high')
  })

  it('reconoce "prioritario" como SET_PRIORITY', () => {
    const result = parseVoiceCommand('Pedido 2040 prioritario')
    expect(result.action).toBe('SET_PRIORITY')
    expect(result.confidence).toBe('high')
  })

  it('reconoce "urgente" como SET_PRIORITY', () => {
    const result = parseVoiceCommand('Pedido 2040 urgente')
    expect(result.action).toBe('SET_PRIORITY')
  })

  it('reconoce "quitar prioridad" como UNSET_PRIORITY, no SET_PRIORITY', () => {
    const result = parseVoiceCommand('Pedido 2040 quitar prioridad')
    expect(result.action).toBe('UNSET_PRIORITY')
    expect(result.confidence).toBe('high')
  })

  it('reconoce "confirmado" como acción del lenguaje (la validación de negocio vive en el motor, no acá)', () => {
    const result = parseVoiceCommand('Pedido 2040 confirmado')
    expect(result.action).toBe('CONFIRM')
    expect(result.confidence).toBe('high')
  })

  it('confidence baja cuando falta la acción (comando incompleto)', () => {
    const result = parseVoiceCommand('Pedido 2040')
    expect(result.orderCode).toBe('2040')
    expect(result.action).toBeNull()
    expect(result.confidence).toBe('low')
  })

  it('confidence baja cuando falta el código de pedido', () => {
    const result = parseVoiceCommand('marcar listo')
    expect(result.orderCode).toBeNull()
    expect(result.action).toBe('MARK_READY')
    expect(result.confidence).toBe('low')
  })

  it('confidence baja cuando el transcript no tiene ni código ni acción reconocible', () => {
    const result = parseVoiceCommand('hola cómo estás')
    expect(result.orderCode).toBeNull()
    expect(result.action).toBeNull()
    expect(result.confidence).toBe('low')
  })

  it('confidence baja cuando hay más de un código de 4 dígitos (ambiguo)', () => {
    const result = parseVoiceCommand('Pedido 2040 o 2049 listo')
    expect(result.orderCode).toBeNull()
    expect(result.confidence).toBe('low')
  })

  it('no confunde un número de 3 o 5 dígitos con un código válido', () => {
    const shortCode = parseVoiceCommand('Pedido 204 listo')
    expect(shortCode.orderCode).toBeNull()
    expect(shortCode.confidence).toBe('low')

    const longCode = parseVoiceCommand('Pedido 20400 listo')
    expect(longCode.orderCode).toBeNull()
    expect(longCode.confidence).toBe('low')
  })

  it('conserva el rawTranscript original tal cual se recibió', () => {
    const result = parseVoiceCommand('  Pedido 2040 listo  ')
    expect(result.rawTranscript).toBe('  Pedido 2040 listo  ')
    expect(result.confidence).toBe('high')
  })
})
