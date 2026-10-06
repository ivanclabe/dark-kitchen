import type { CopilotAnswer, CopilotScope, CopilotTurn } from '../api'

/** One message of the conversation, as the panel shows it. */
export interface CopilotMessage {
  role: 'user' | 'assistant'
  content: string
  /** The answer's intent and what it consulted (ADR 0038): context for the next question. */
  intent?: string
  steps?: CopilotAnswer['steps']
  scope?: CopilotScope
  followUp?: string[]
  links?: CopilotAnswer['links']
  runId?: string
  feedback?: 1 | -1 | null
  /** Asked by voice: its answer was heard, maybe not seen (the badge on ✦). */
  channel?: 'voice' | 'text'
  /** An error, and the question to ask again (Reintentar). */
  error?: boolean
  retryQuestion?: string
  retryable?: boolean
}

/** How many turns travel as context (3 questions with their answers). */
export const CONTEXT_TURNS = 6
/** How long a conversation survives in this tab (ADR 0038, D6). */
export const CONVERSATION_TTL_MS = 30 * 60_000

/**
 * The recent conversation for the agent (ADR 0038): the last turns without
 * errors; each answer with its intent and what it consulted («sales
 * {"from":"…"}»), so «¿y ayer?» can reuse the period and the subject.
 */
export function historyFor(messages: CopilotMessage[], turns = CONTEXT_TURNS): CopilotTurn[] {
  return messages
    .filter((m) => !m.error && m.content.trim())
    .slice(-turns)
    .map((m) =>
      m.role === 'user'
        ? { role: 'user', content: m.content }
        : { role: 'assistant', content: m.content, intent: m.intent, tools: (m.steps ?? []).filter((s) => s.ok).map((s) => s.context ?? s.tool) },
    )
}

const storageKey = (accountId: string) => `dk-copilot-conversation:${accountId}`

/** The conversation of this account in this tab, if it is recent (survives a reload, never leaves the device). */
export function loadConversation(accountId: string, now = Date.now()): CopilotMessage[] {
  try {
    const raw = sessionStorage.getItem(storageKey(accountId))
    if (!raw) return []
    const saved = JSON.parse(raw) as { savedAt: number; messages: CopilotMessage[] }
    if (!Array.isArray(saved.messages) || now - saved.savedAt > CONVERSATION_TTL_MS) {
      sessionStorage.removeItem(storageKey(accountId))
      return []
    }
    return saved.messages
  } catch {
    return []
  }
}

export function saveConversation(accountId: string, messages: CopilotMessage[], now = Date.now()) {
  try {
    if (messages.length === 0) sessionStorage.removeItem(storageKey(accountId))
    else sessionStorage.setItem(storageKey(accountId), JSON.stringify({ savedAt: now, messages: messages.slice(-40) }))
  } catch {
    // Blocked storage: the conversation lives in memory only.
  }
}
