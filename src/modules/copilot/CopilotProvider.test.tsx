// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'
import type { VoiceHandler } from '@/modules/voice/types'
import type { CopilotAnswer } from './api'

// ADR 0033: Copilot through «Oye Quanela» — scopes, 👍/👎, retry, questions by voice, reading answers.
const state = vi.hoisted(() => ({
  handler: null as VoiceHandler | null,
  said: [] as { text: string; priority: string }[],
  readTyped: false,
  asked: [] as { question: string; channel: string }[],
  histories: [] as unknown[][],
  rated: [] as unknown[],
  next: [] as (CopilotAnswer | Error)[],
}))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({
  useActiveKitchen: () => ({ canUseFeature: () => true, can: () => true, path: (to: string) => `/k/centro${to}`, kitchen: { id: 'k1', name: 'Centro' } }),
}))
vi.mock('@/modules/voice/voiceContext', () => ({
  useVoice: () => ({
    replies: true,
    speechAllowed: true,
    available: true,
    dictating: false,
    say: (text: string, priority: string) => (state.said.push({ text, priority }), true),
    stop: vi.fn(),
    dictate: vi.fn(),
  }),
  useVoiceHandler: (h: VoiceHandler | null) => {
    state.handler = h
  },
}))
vi.mock('@/modules/voice/prefs', () => ({ useVoiceFlag: () => [state.readTyped, vi.fn()] }))
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  askCopilot: async ({ question, channel, history }: { question: string; channel: string; history: unknown[] }) => {
    state.asked.push({ question, channel })
    state.histories.push(history)
    const next = state.next.shift()
    if (next instanceof Error) throw next
    return next
  },
  cancelCopilot: vi.fn(),
  rateCopilotAnswer: async (runId: string, value: number) => void state.rated.push([runId, value]),
}))

const { CopilotProvider, CopilotButton } = await import('./CopilotProvider')
const { CopilotError } = await import('./api')

const answer = (over: Partial<CopilotAnswer> = {}): CopilotAnswer => ({
  answer: 'Hoy vendiste **$20.000**.',
  spoken: 'Hoy vendiste veinte mil pesos.',
  intent: 'sales',
  scope: 'answered',
  followUp: ['¿Y ayer?'],
  steps: [{ tool: 'sales', label: 'Consultando ventas', ok: true, context: 'sales {"from":"2026-10-06"}' }],
  runId: 'run-1',
  remainingToday: 24,
  timings: { rounds: [900], total: 1200 },
  ...over,
})

function renderCopilot() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/k/centro/operations']}>
        <CopilotProvider>
          <CopilotButton />
        </CopilotProvider>
      </MemoryRouter>
    </ToastProvider>,
  )
}

async function ask(text: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Abrir Quanela Copilot' }))
  fireEvent.change(screen.getByLabelText('Pregunta para Copilot'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
  await screen.findByText(/preguntas hoy|Reintentar|Consulta/)
}

beforeEach(() => {
  // jsdom has no layout: the panel scrolls to the last message.
  Element.prototype.scrollIntoView = vi.fn()
  state.handler = null
  state.said = []
  state.asked = []
  state.histories = []
  state.rated = []
  state.next = []
  state.readTyped = false
  // ADR 0038: the conversation is kept in this tab; every test starts a new one.
  sessionStorage.clear()
})
afterEach(cleanup)

describe('Copilot (ADR 0033)', () => {
  it('a typed answer, its steps, follow-ups and 👍', async () => {
    state.next = [answer()]
    renderCopilot()
    await ask('¿cuánto vendimos hoy?')
    expect(state.asked).toEqual([{ question: '¿cuánto vendimos hoy?', channel: 'text' }])
    expect(screen.getByText('Consultando ventas')).toBeTruthy()
    expect(screen.getByRole('button', { name: '¿Y ayer?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Buena respuesta' }))
    await waitFor(() => expect(state.rated).toEqual([['run-1', 1]]))
    // Typed, and «Leer respuestas» off: not read aloud.
    expect(state.said).toEqual([])
  })

  it('out of scope is labelled as such', async () => {
    state.next = [answer({ scope: 'out_of_scope', answer: 'Solo puedo ayudarte con tu negocio en Quanela.' })]
    renderCopilot()
    await ask('¿va a llover mañana?')
    expect(screen.getByText('Fuera del negocio')).toBeTruthy()
  })

  it('a failure can be retried; a quota refusal cannot', async () => {
    state.next = [new CopilotError('Copilot no pudo responder en este momento. Intenta de nuevo.', 'AI_ERROR', true), answer()]
    renderCopilot()
    await ask('¿cuánto vendimos hoy?')
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }))
    await screen.findByText('Consultando ventas')
    expect(state.asked).toHaveLength(2)
    cleanup()
    sessionStorage.clear()
    state.next = [new CopilotError('Llegaste al límite diario de preguntas a Copilot en esta cuenta.', 'NOT_ALLOWED', false)]
    renderCopilot()
    await ask('¿y ayer?')
    expect(screen.queryByRole('button', { name: /Reintentar/ })).toBeNull()
  })

  it('«Leer respuestas» on: a typed answer is read after the kitchen alerts', async () => {
    state.readTyped = true
    state.next = [answer()]
    renderCopilot()
    await ask('¿cuánto vendimos hoy?')
    expect(state.said).toEqual([{ text: 'Hoy vendiste veinte mil pesos.', priority: 'answer' }])
  })

  it('by voice: «Oye Quanela» hands it the question; the panel stays closed, ✦ says there is an answer to see', async () => {
    state.next = [answer()]
    renderCopilot()
    expect(state.handler).toMatchObject({ id: 'copilot', fallback: true })
    let reply: unknown
    await act(async () => {
      reply = await state.handler!.handle('cuánto vendimos hoy', { engine: 'browser', signal: new AbortController().signal })
    })
    expect(state.asked).toEqual([{ question: 'cuánto vendimos hoy', channel: 'voice' }])
    expect(reply).toMatchObject({ spoken: 'Hoy vendiste veinte mil pesos.', priority: 'answer' })
    expect(screen.queryByLabelText('Pregunta para Copilot')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Quanela Copilot: 1 respuesta sin ver' }))
    expect(screen.getByText('Consultando ventas')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Abrir Quanela Copilot' })).toBeTruthy()
  })

  it('the next question carries the recent conversation, with what the last answer consulted (ADR 0038)', async () => {
    state.next = [answer(), answer()]
    renderCopilot()
    await act(async () => {
      await state.handler!.handle('cuánto vendimos hoy', { engine: 'browser', signal: new AbortController().signal })
    })
    await act(async () => {
      await state.handler!.handle('y ayer', { engine: 'browser', signal: new AbortController().signal })
    })
    expect(state.histories[1]).toEqual([
      { role: 'user', content: 'cuánto vendimos hoy' },
      expect.objectContaining({ role: 'assistant', intent: 'sales', tools: ['sales {"from":"2026-10-06"}'] }),
    ])
  })

  it('the conversation survives a reload of the tab', async () => {
    state.next = [answer()]
    renderCopilot()
    await act(async () => {
      await state.handler!.handle('cuánto vendimos hoy', { engine: 'browser', signal: new AbortController().signal })
    })
    cleanup()
    renderCopilot()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Quanela Copilot' }))
    expect(screen.getByText('cuánto vendimos hoy')).toBeTruthy()
  })

  it('Ctrl/⌘ + J opens Copilot; with Shift it is «Oye Quanela», not this', () => {
    renderCopilot()
    fireEvent.keyDown(window, { key: 'J', ctrlKey: true, shiftKey: true })
    expect(screen.queryByLabelText('Pregunta para Copilot')).toBeNull()
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true })
    expect(screen.getByLabelText('Pregunta para Copilot')).toBeTruthy()
  })
})
