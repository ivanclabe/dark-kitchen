import { createContext, use } from 'react'

export interface CopilotContextValue {
  available: boolean
  open: () => void
  /** Answers to voice questions not seen in the panel yet (ADR 0038: the voice does not open it). */
  unseen: number
  /** A question is being answered. */
  pending: boolean
}

export const CopilotContext = createContext<CopilotContextValue>({ available: false, open: () => {}, unseen: 0, pending: false })

export function useCopilot(): CopilotContextValue {
  return use(CopilotContext)
}
