import { beforeEach, describe, expect, it, vi } from 'vitest'

// ADR 0041: the answer in parts for the voice, and waking the function.
const state = vi.hoisted(() => ({
  requests: [] as { url: string; body: Record<string, unknown>; headers: Headers }[],
  respond: null as (() => Response) | null,
  invoked: [] as unknown[],
}))
vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'token-1' } } }) },
    functions: { invoke: async (_name: string, opts: { body: unknown }) => (state.invoked.push(opts.body), { data: null, error: null }) },
  },
  kitchenAwareFetch: async (url: string, init: RequestInit) => {
    state.requests.push({ url, body: JSON.parse(String(init.body)), headers: new Headers(init.headers) })
    return state.respond!()
  },
}))

const { askCopilot, warmCopilot, CopilotError } = await import('./api')

const final = { answer: 'Hoy vendiste **$20.000**.', spoken: 'Hoy vendiste veinte mil pesos.', intent: 'sales', scope: 'answered', followUp: [], steps: [], runId: 'run-1', remainingToday: 9, timings: { rounds: [800], total: 900 } }

/** A body that arrives in the given pieces (lines may be cut anywhere). */
function parts(pieces: string[], contentType = 'application/x-ndjson', status = 200): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const p of pieces) controller.enqueue(encoder.encode(p))
        controller.close()
      },
    }),
    { status, headers: { 'content-type': contentType } },
  )
}

const ask = (onSpoken = vi.fn()) =>
  askCopilot({ question: '¿cuánto vendimos hoy?', history: [], screen: null, channel: 'voice', requestId: 'r1', client: { wake: true, listenMs: 300 }, onSpoken })

beforeEach(() => {
  state.requests = []
  state.invoked = []
})

describe('the answer in parts (ADR 0041, D7)', () => {
  it('hears the spoken sentence first, then returns the whole answer', async () => {
    const line = JSON.stringify({ type: 'final', ...final })
    state.respond = () => parts([`{"type":"spoken","spo`, `ken":"Hoy vendiste veinte mil pesos."}\n${line.slice(0, 20)}`, `${line.slice(20)}\n`])
    const onSpoken = vi.fn()
    const result = await ask(onSpoken)
    expect(onSpoken).toHaveBeenCalledWith('Hoy vendiste veinte mil pesos.')
    expect(result).toMatchObject({ answer: final.answer, runId: 'run-1' })
    const req = state.requests[0]
    expect(req.url).toMatch(/\/functions\/v1\/dk-copilot$/)
    expect(req.body).toMatchObject({ stream: true, channel: 'voice', client: { wake: true, listenMs: 300 } })
    expect(req.headers.get('authorization')).toBe('Bearer token-1')
  })

  it('an error in the middle is a Copilot error (retryable when it is a timeout)', async () => {
    state.respond = () => parts([`${JSON.stringify({ type: 'error', status: 504, error: 'TIMEOUT', message: 'La consulta tardó demasiado.' })}\n`])
    const err = await ask().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CopilotError)
    expect(err).toMatchObject({ code: 'TIMEOUT', retryable: true, message: 'La consulta tardó demasiado.' })
  })

  it('a refusal before answering keeps its reason and wait', async () => {
    state.respond = () => new Response(JSON.stringify({ error: 'NOT_ALLOWED', reason: 'interval', retryAfterSeconds: 4, message: 'Espera 4 s antes de la próxima pregunta.' }), { status: 429 })
    const err = await ask().catch((e: unknown) => e)
    expect(err).toMatchObject({ code: 'NOT_ALLOWED', retryable: false, retryAfterSeconds: 4 })
  })

  it('a whole answer (not in parts) is read as before', async () => {
    state.respond = () => new Response(JSON.stringify(final), { status: 200, headers: { 'content-type': 'application/json' } })
    const onSpoken = vi.fn()
    expect(await ask(onSpoken)).toMatchObject({ runId: 'run-1' })
    expect(onSpoken).not.toHaveBeenCalled()
  })

  it('cut before the end: an error that can be retried', async () => {
    state.respond = () => parts([`{"type":"spoken","spoken":"Hoy vendiste."}\n`])
    expect(await ask().catch((e: unknown) => e)).toMatchObject({ code: 'AI_ERROR', retryable: true })
  })
})

describe('waking the function (ADR 0041, D4)', () => {
  it('at most once a minute, and it asks nothing', () => {
    warmCopilot(1_000_000)
    warmCopilot(1_030_000)
    expect(state.invoked).toEqual([{ action: 'warm' }])
    warmCopilot(1_061_000)
    expect(state.invoked).toHaveLength(2)
  })
})
