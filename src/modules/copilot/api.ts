import { supabase } from '@/shared/lib/supabase'

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
  remainingToday: number | null
  timings: { rounds: number[]; total: number }
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
}): Promise<CopilotAnswer> {
  const { signal, ...body } = input
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

/** ⏹: the run being answered is closed as cancelled (only the person's own). */
export async function cancelCopilot(requestId: string): Promise<void> {
  await supabase.functions.invoke('dk-copilot', { body: { action: 'cancel', requestId } }).catch(() => undefined)
}

/** 👍 / 👎 on an answer (ADR 0033, phase 4). */
export async function rateCopilotAnswer(runId: string, value: 1 | -1 | null): Promise<void> {
  const { error } = await supabase.rpc('dk_ai_run_feedback', { p_run_id: runId, p_value: value as number })
  if (error) throw error
}
