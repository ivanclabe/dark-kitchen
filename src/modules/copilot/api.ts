import { supabase } from '@/shared/lib/supabase'

export interface CopilotTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface CopilotAnswer {
  answer: string
  steps: { tool: string; label: string; ok: boolean }[]
  remainingToday: number | null
}

/**
 * Asks Quanela Copilot (ADR 0020). The active account and role travel in the
 * headers (same client as the rest of the app), so the answer only uses
 * what this person may see. The conversation lives only in the browser.
 */
export async function askCopilot(question: string, history: CopilotTurn[], screen: string | null): Promise<CopilotAnswer> {
  const { data, error } = await supabase.functions.invoke<CopilotAnswer>('dk-copilot', { body: { question, history, screen } })
  if (error) {
    const context = (error as { context?: Response }).context
    const payload = context ? await context.json().catch(() => null) : null
    throw new Error(payload?.message ?? payload?.error ?? 'Copilot no pudo responder en este momento.')
  }
  return data as CopilotAnswer
}
