import { describe, expect, it } from 'vitest'
import { parseVoiceCommand, type VoiceAction } from './commandParser'
import { COMMAND_WORDS, commandGrammar } from './commandGrammar'
import { spokenNumbersToDigits } from './spokenNumbers'

describe('command grammar (ADR 0015)', () => {
  it('is valid JSON with [unk] for anything else', () => {
    const grammar = JSON.parse(commandGrammar()) as string[]
    expect(grammar).toContain('[unk]')
    expect(new Set(grammar).size).toBe(grammar.length)
  })

  // Every action the parser knows can be said with grammar words only.
  it.each<[string, VoiceAction]>([
    ['pedido dos mil cuarenta listo', 'MARK_READY'],
    ['pedido dos mil cuarenta terminado', 'MARK_READY'],
    ['pedido dos mil cuarenta en preparación', 'START_PREPARATION'],
    ['pedido dos mil cuarenta empezar', 'START_PREPARATION'],
    ['pedido dos mil cuarenta cancelar', 'CANCEL'],
    ['pedido dos mil cuarenta urgente', 'SET_PRIORITY'],
    ['pedido dos mil cuarenta quitar prioridad', 'UNSET_PRIORITY'],
    ['pedido dos mil cuarenta confirmar', 'CONFIRM'],
  ])('"%s" → %s', (phrase, action) => {
    for (const word of phrase.split(' ')) expect(COMMAND_WORDS).toContain(word)
    expect(parseVoiceCommand(spokenNumbersToDigits(phrase))).toMatchObject({ orderCode: '2040', action, confidence: 'high' })
  })
})
