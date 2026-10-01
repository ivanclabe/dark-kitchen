import { describe, expect, it } from 'vitest'
import { parseVoiceCommand } from './commandParser'
import { numberRunToCode, spokenNumbersToDigits } from './spokenNumbers'

describe('spokenNumbersToDigits (ADR 0015)', () => {
  it.each([
    ['pedido dos mil cuarenta listo', 'pedido 2040 listo'],
    ['pedido mil cuarenta y dos cancelar', 'pedido 1042 cancelar'],
    ['pedido veinte cuarenta listo', 'pedido 2040 listo'],
    ['pedido diez cero cinco en preparación', 'pedido 1005 en preparación'],
    ['pedido dos cero cuatro cero urgente', 'pedido 2040 urgente'],
    ['doce treinta y cuatro listo', '1234 listo'],
    ['veintiuno cuarenta listo', '2140 listo'],
    ['mil listo', '1000 listo'],
    ['nueve mil novecientos noventa y nueve listo', '9999 listo'],
    ['pedido tres mil doscientos cinco listo', 'pedido 3205 listo'],
    ['pedido dieciséis veintidós listo', 'pedido 1622 listo'],
  ])('%s → %s', (spoken, expected) => {
    expect(spokenNumbersToDigits(spoken)).toBe(expected)
  })

  it('leaves text without a 4-digit code untouched', () => {
    expect(spokenNumbersToDigits('pedido veinte listo')).toBe('pedido veinte listo')
    expect(spokenNumbersToDigits('pedido cien mil listo')).toBe('pedido cien mil listo')
    expect(spokenNumbersToDigits('listo y cancelar')).toBe('listo y cancelar')
    expect(spokenNumbersToDigits('')).toBe('')
  })

  it('keeps digits from the browser recognizer as they are', () => {
    expect(spokenNumbersToDigits('pedido 2040 listo')).toBe('pedido 2040 listo')
  })

  it('accepts a ten and a unit without "y" (recognizers often drop it)', () => {
    expect(spokenNumbersToDigits('pedido mil cuarenta dos cancelar')).toBe('pedido 1042 cancelar')
    expect(spokenNumbersToDigits('pedido quince treinta ocho listo')).toBe('pedido 1538 listo')
    expect(numberRunToCode(['veinte', 'cuatro'])).toBeNull() // 24: two digits, not a code
  })

  it('feeds the command parser: the whole path works end to end', () => {
    const parsed = parseVoiceCommand(spokenNumbersToDigits('pedido dos mil cuarenta listo'))
    expect(parsed).toMatchObject({ orderCode: '2040', action: 'MARK_READY', confidence: 'high' })
  })
})
