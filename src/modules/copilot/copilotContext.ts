import { createContext, use } from 'react'

export interface CopilotContextValue {
  available: boolean
  open: () => void
}

export const CopilotContext = createContext<CopilotContextValue>({ available: false, open: () => {} })

export function useCopilot(): CopilotContextValue {
  return use(CopilotContext)
}
