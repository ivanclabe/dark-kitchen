import { describe, expect, it } from 'vitest'
import { clarityHeuristic, formatMoney, inventsMoney, mentionsFigure, percentile, pick, wer } from '../../../../supabase/tests/copilot_eval/score'

// ADR 0033, phase 4: the scoring of the evaluation run is itself tested.
describe('Copilot evaluation scoring', () => {
  it('finds the right figure as Copilot writes it', () => {
    expect(formatMoney(1250000)).toBe('$1.250.000')
    expect(mentionsFigure('Hoy vendiste **$1.250.000** en 32 pedidos.', 1250000, 'money')).toBe(true)
    expect(mentionsFigure('Hoy vendiste $1.250.001.', 1250000, 'money')).toBe(false)
    expect(mentionsFigure('Fueron 32 pedidos.', 32, 'count')).toBe(true)
    expect(mentionsFigure('Fueron 132 pedidos.', 32, 'count')).toBe(false)
    expect(mentionsFigure('Hoy no hay ventas todavía.', 0, 'money')).toBe(true)
  })

  it('flags an invented amount', () => {
    expect(inventsMoney('Quanela no registra la nómina.')).toBe(false)
    expect(inventsMoney('La nómina fue de $2.000.000.')).toBe(true)
  })

  it('clarity: short, answer first, clean spoken summary, Spanish', () => {
    expect(clarityHeuristic({ answer: 'Hoy vendiste $20.000 en 2 pedidos.', spoken: 'Hoy vendiste veinte mil pesos.', intent: 'sales', scope: 'answered' })).toBe(5)
    expect(clarityHeuristic({ answer: 'x'.repeat(1200), spoken: 'Uno. Dos. Tres. | tabla', intent: 'sales', scope: 'answered' })).toBe(2)
  })

  it('percentiles and paths', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3)
    expect(percentile([5, 1, 3, 2, 4], 90)).toBe(5)
    expect(percentile([], 50)).toBeNull()
    expect(pick({ toCollect: { total: 7 } }, 'toCollect.total')).toBe(7)
  })

  it('word error rate of what was heard (accents and punctuation do not count)', () => {
    expect(wer('cuánto vendimos hoy', '¿Cuanto vendimos hoy?')).toBe(0)
    expect(wer('pedido dos mil cuarenta listo', 'pedido dos mil cuarenta')).toBeCloseTo(0.2)
  })
})
