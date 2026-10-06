import { describe, expect, it } from 'vitest'
import { cleanSpoken, PARTIAL, readAnswer, sanitizeLinks } from '../../../../supabase/functions/dk-copilot/contract'

// ADR 0033: what Copilot's agent does with the model's closing `answer` (pure parts of the Edge Function).
describe('the answer contract', () => {
  it('reads intent, scope, answer, a short spoken version and up to 2 follow-ups', () => {
    const a = readAnswer({
      intent: 'sales',
      scope: 'answered',
      answer: 'Hoy vendiste **$1.250.000** en 32 pedidos.',
      spoken: 'Hoy vendiste un millón doscientos cincuenta mil pesos. Fueron treinta y dos pedidos. El ticket subió.',
      follow_up: ['¿Y ayer?', '¿Qué plato vendió más?', 'extra'],
    })
    expect(a).toMatchObject({ intent: 'sales', scope: 'answered', followUp: ['¿Y ayer?', '¿Qué plato vendió más?'] })
    expect(a?.spoken).toBe('Hoy vendiste un millón doscientos cincuenta mil pesos. Fueron treinta y dos pedidos.')
  })

  it('an unknown intent or scope never passes as is', () => {
    expect(readAnswer({ intent: 'hack', scope: 'whatever', answer: 'x', spoken: 'x' })).toMatchObject({ intent: 'other', scope: 'answered' })
  })

  it('without an answer there is no contract (the agent falls back to a partial answer)', () => {
    expect(readAnswer({ intent: 'sales', scope: 'answered', answer: '  ', spoken: 'x' })).toBeNull()
    expect(PARTIAL.scope).toBe('partial')
  })

  it('the spoken version has no tables, links nor marks', () => {
    expect(cleanSpoken('Mira el [#1042](quanela://order/abc) y la **tabla** | a | b |')).toBe('Mira el número 1042 y la tabla a b')
  })

  it('links only to what a tool returned', () => {
    const ok = '11111111-1111-1111-1111-111111111111'
    const fake = '22222222-2222-2222-2222-222222222222'
    expect(sanitizeLinks(`[#1](quanela://order/${ok}) y [#2](quanela://order/${fake})`, new Set([ok]))).toBe(`[#1](quanela://order/${ok}) y #2`)
  })
})

describe('help links in the answer (ADR 0034): only real articles', () => {
  const known = (id: string) => (id === 'kitchen-view' ? { id, title: 'Usar la vista Cocina', url: '/help/kitchen/kitchen-view' } : null)

  it('keeps the articles that exist, drops invented ids and repeats, at most 2', () => {
    const a = readAnswer({ intent: 'app_help', scope: 'answered', answer: 'Abre Operación → Cocina.', spoken: 'Abre Cocina.', links: ['kitchen-view', 'made-up', 'kitchen-view'] }, known)
    expect(a?.links).toEqual([{ id: 'kitchen-view', title: 'Usar la vista Cocina', url: '/help/kitchen/kitchen-view' }])
  })

  it('without links the answer has none', () => {
    expect(readAnswer({ intent: 'sales', scope: 'answered', answer: 'x', spoken: 'x' }, known)?.links).toEqual([])
  })
})
