import { kitchenAwareFetch, supabase } from '@/shared/lib/supabase'
import type { Json } from '@/types/database'

export interface CopilotTurn {
  role: 'user' | 'assistant'
  content: string
  /** An answer's intent and what it consulted (ADR 0038): context for a follow-up. */
  intent?: string
  tools?: string[]
}

/** Whether the question could be answered (ADR 0033, the answer contract). */
export type CopilotScope = 'answered' | 'partial' | 'no_data' | 'not_allowed' | 'unsupported' | 'out_of_scope' | 'action' | 'clarify'

export interface CopilotAnswer {
  answer: string
  /** One or two sentences to be read aloud. */
  spoken: string
  intent: string
  scope: CopilotScope
  followUp: string[]
  /** Help center articles to open (ADR 0034), only real ones. */
  links?: { id: string; title: string; url: string }[]
  /** What each step consulted; `context` is the tool with its arguments («sales {"from":…}»). */
  steps: { tool: string; label: string; ok: boolean; context?: string }[]
  runId: string
  /** The model that answered (ADR 0041: the voice may use its own). */
  model?: string
  remainingToday: number | null
  timings: { rounds: number[]; total: number; setup?: number; spoken?: number | null }
}

/** What the app measured of a voice question (ADR 0041, D1); the server keeps only known keys. */
export interface CopilotClientTimings {
  wake?: boolean
  followUp?: boolean
  streamed?: boolean
  listenMs?: number
  endpointMs?: number
  requestMs?: number
  speechMs?: number
  totalMs?: number
}

/** Why Copilot could not answer, and whether trying again makes sense. */
export class CopilotError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly retryAfterSeconds: number | null

  constructor(message: string, code: string, retryable: boolean, retryAfterSeconds: number | null = null) {
    super(message)
    this.code = code
    this.retryable = retryable
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/**
 * Asks Quanela Copilot (ADR 0020, ADR 0033). The active account and role
 * travel in the headers (same client as the rest of the app), so the answer
 * only uses what this person may see. The conversation lives only in the
 * browser. `requestId` lets ⏹ cancel the run on the server too.
 */
export async function askCopilot(input: {
  question: string
  history: CopilotTurn[]
  screen: string | null
  channel: 'voice' | 'text'
  requestId: string
  signal?: AbortSignal
  client?: CopilotClientTimings
  /** ADR 0041 (D7): hear the spoken sentence before the whole answer arrives (voice only). */
  onSpoken?: (spoken: string) => void
}): Promise<CopilotAnswer> {
  const { signal, onSpoken, ...body } = input
  if (onSpoken && body.channel === 'voice') return askCopilotStream(body, onSpoken, signal)
  const { data, error } = await supabase.functions.invoke<CopilotAnswer>('dk-copilot', { body, signal })
  if (error) {
    if (signal?.aborted) throw new CopilotError('Consulta cancelada.', 'CANCELLED', false)
    const context = (error as { context?: Response }).context
    const payload = context ? await context.json().catch(() => null) : null
    const code: string = payload?.error ?? 'AI_ERROR'
    const message: string = payload?.message ?? 'Copilot no pudo responder en este momento. Intenta de nuevo.'
    // A refusal for quota or permission is not solved by retrying at once; a failure or a timeout is.
    const retryable = code === 'AI_ERROR' || code === 'TIMEOUT' || !context
    throw new CopilotError(message, code, retryable, payload?.retryAfterSeconds ?? null)
  }
  return data as CopilotAnswer
}

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dk-copilot`

/** A refusal or failure sent by the function, as the rest of the app expects it. */
function errorFrom(payload: { error?: string; message?: string; retryAfterSeconds?: number | null } | null, reachedServer: boolean): CopilotError {
  const code = payload?.error ?? 'AI_ERROR'
  const message = payload?.message ?? 'Copilot no pudo responder en este momento. Intenta de nuevo.'
  const retryable = code === 'AI_ERROR' || code === 'TIMEOUT' || !reachedServer
  return new CopilotError(message, code, retryable, payload?.retryAfterSeconds ?? null)
}

/**
 * The answer in parts (ADR 0041, D7): one JSON per line — `spoken` as soon as
 * the sentence to say exists, then `final` (the usual answer) or `error`.
 * Read with fetch, because the Supabase client returns the body only when it
 * is complete; same headers (session, account and role).
 */
async function askCopilotStream(body: Record<string, unknown>, onSpoken: (spoken: string) => void, signal?: AbortSignal): Promise<CopilotAnswer> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new CopilotError('Inicia sesión otra vez para preguntarle a Copilot.', 'NO_SESSION', false)
  let res: Response
  try {
    res = await kitchenAwareFetch(FUNCTION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    })
  } catch {
    if (signal?.aborted) throw new CopilotError('Consulta cancelada.', 'CANCELLED', false)
    throw errorFrom(null, false)
  }
  if (!res.ok) throw errorFrom(await res.json().catch(() => null), true)
  // Not in parts (an older function or a proxy that joined them): the whole answer, as before.
  if (!res.headers.get('content-type')?.includes('ndjson') || !res.body) return (await res.json()) as CopilotAnswer

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let final: CopilotAnswer | null = null
  const handle = (line: string) => {
    if (!line.trim()) return
    const event = JSON.parse(line) as { type: string; spoken?: string } & Record<string, unknown>
    if (event.type === 'spoken' && typeof event.spoken === 'string') onSpoken(event.spoken)
    else if (event.type === 'final') final = event as unknown as CopilotAnswer
    else if (event.type === 'error') throw errorFrom(event as { error?: string; message?: string }, true)
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (value) buffer += decoder.decode(value, { stream: true })
      let cut: number
      while ((cut = buffer.indexOf('\n')) >= 0) {
        handle(buffer.slice(0, cut))
        buffer = buffer.slice(cut + 1)
      }
      if (done) break
    }
    handle(buffer)
  } catch (err) {
    if (signal?.aborted) throw new CopilotError('Consulta cancelada.', 'CANCELLED', false)
    if (err instanceof CopilotError) throw err
    throw errorFrom(null, false)
  }
  if (!final) throw errorFrom(null, false)
  return final
}

let warmedAt = 0
/**
 * ADR 0041 (D4): «Oye Quanela» was heard — wake the function while the person
 * is still speaking, so the question does not wait for a cold start. At most
 * once a minute; it reads nothing and spends no quota.
 */
export function warmCopilot(now = Date.now()): void {
  if (now - warmedAt < 60_000) return
  warmedAt = now
  void supabase.functions.invoke('dk-copilot', { body: { action: 'warm' } }).catch(() => {
    warmedAt = 0
  })
}

/** ADR 0041 (D1): what the app measured after the answer (until Quanela started speaking), on the person's own run. */
export async function reportCopilotTimings(runId: string, timings: CopilotClientTimings): Promise<void> {
  await supabase.rpc('dk_ai_run_client_timings', { p_run_id: runId, p_timings: timings as Json })
}

/** ⏹: the run being answered is closed as cancelled (only the person's own). */
export async function cancelCopilot(requestId: string): Promise<void> {
  await supabase.functions.invoke('dk-copilot', { body: { action: 'cancel', requestId } }).catch(() => undefined)
}

/** 👍 / 👎 on an answer (ADR 0033, phase 4). */
export async function rateCopilotAnswer(runId: string, value: 1 | -1 | null): Promise<void> {
  const { error } = await supabase.rpc('dk_ai_run_feedback', { p_run_id: runId, p_value: value as number })
  if (error) throw error
}
