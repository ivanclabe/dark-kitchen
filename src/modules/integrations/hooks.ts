import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  connectWhatsapp,
  deleteEndpoint,
  disconnectWhatsapp,
  listConversations,
  listMessages,
  rotateEndpointSecret,
  saveEndpoint,
  sendWaText,
  setWaConversation,
  testEndpoint,
  getWaSettings,
  listWaLog,
  regenerateVerifyToken,
  retryWaMessage,
  saveWaSettings,
  saveWaTemplate,
  sendWaTest,
  waAdmin,
} from './api/whatsapp'
import type { OutboxStatus, WaEvent } from './types'

const SETTINGS = ['wa-settings'] as const
const LOG = ['wa-log'] as const

export const useWaSettings = () => useQuery({ queryKey: SETTINGS, queryFn: getWaSettings })

/** The log of notices, live while the page is open (statuses arrive from Meta). */
export const useWaLog = (status: OutboxStatus | 'all') =>
  useQuery({ queryKey: [...LOG, status], queryFn: () => listWaLog(status), refetchInterval: 10_000 })

export function useWaActions() {
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: SETTINGS })
    void queryClient.invalidateQueries({ queryKey: LOG })
  }
  return {
    connect: useMutation({ mutationFn: connectWhatsapp, onSuccess: refresh }),
    regenerate: useMutation({ mutationFn: regenerateVerifyToken, onSuccess: refresh }),
    disconnect: useMutation({ mutationFn: disconnectWhatsapp, onSuccess: refresh }),
    save: useMutation({ mutationFn: saveWaSettings, onSuccess: refresh }),
    saveTemplate: useMutation({ mutationFn: saveWaTemplate, onSuccess: refresh }),
    sendTest: useMutation({ mutationFn: ({ event, to }: { event: WaEvent; to: string }) => sendWaTest(event, to), onSuccess: refresh }),
    retry: useMutation({ mutationFn: retryWaMessage, onSuccess: refresh }),
    admin: useMutation({ mutationFn: (action: 'check' | 'create_templates' | 'sync_templates') => waAdmin(action), onSuccess: refresh }),
  }
}

const CONVERSATIONS = ['wa-conversations'] as const

/** The inbox, live (new messages every few seconds). */
export const useWaConversations = (filter: 'attention' | 'all') =>
  useQuery({ queryKey: [...CONVERSATIONS, filter], queryFn: () => listConversations(filter), refetchInterval: 5_000 })

export const useWaMessages = (conversationId: string | null) =>
  useQuery({ queryKey: ['wa-messages', conversationId], queryFn: () => listMessages(conversationId!), enabled: !!conversationId, refetchInterval: 4_000 })

export function useInboxActions() {
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: CONVERSATIONS })
    void queryClient.invalidateQueries({ queryKey: ['wa-messages'] })
    void queryClient.invalidateQueries({ queryKey: SETTINGS })
  }
  return {
    send: useMutation({ mutationFn: ({ id, text }: { id: string; text: string }) => sendWaText(id, text), onSuccess: refresh }),
    setStatus: useMutation({ mutationFn: ({ id, status }: { id: string; status: 'bot' | 'human' | 'closed' | null }) => setWaConversation(id, status), onSuccess: refresh }),
  }
}

export function useEndpointActions() {
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: SETTINGS })
    void queryClient.invalidateQueries({ queryKey: LOG })
  }
  return {
    save: useMutation({ mutationFn: saveEndpoint, onSuccess: refresh }),
    rotate: useMutation({ mutationFn: rotateEndpointSecret, onSuccess: refresh }),
    remove: useMutation({ mutationFn: deleteEndpoint, onSuccess: refresh }),
    test: useMutation({ mutationFn: testEndpoint, onSuccess: refresh }),
  }
}
