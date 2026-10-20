import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ThemeDesign } from './lib/themes'
import {
  askDesigner,
  deleteDesign,
  listDesigns,
  publishDesign,
  saveDesign,
  updateDesign,
  applyDesignAsDraft,
  discardThemeDraft, getPublicMenu, getPublicMenuPreview, getPublicMenuSettings, publishTheme, revertTheme, savePublicMenuSettings, saveThemeDraft } from './api/publicMenu'

export const usePublicMenuSettings = (enabled = true) => useQuery({ queryKey: ['public-menu-settings'], queryFn: getPublicMenuSettings, enabled })

/** Today's public menu as customers see it (only once published). */
export const usePublicMenuPreview = (slug: string | undefined, enabled: boolean) =>
  useQuery({ queryKey: ['public-menu', slug], queryFn: () => getPublicMenu(slug!), enabled: enabled && !!slug })

export function useSavePublicMenuSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: savePublicMenuSettings,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['public-menu-settings'] })
      void queryClient.invalidateQueries({ queryKey: ['public-menu'] })
    },
  })
}

/** Today's menu for the design preview: also when not published (ADR 0053). */
export const usePublicMenuDraftPreview = () => useQuery({ queryKey: ['public-menu-preview'], queryFn: getPublicMenuPreview })

/** Autosave of the draft: it never touches the public page. */
export function useSaveThemeDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveThemeDraft,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['public-menu-settings'] }),
  })
}

/** Publish, discard or revert: the public page (and its tracking) change. */
export function useThemeAction(action: 'publish' | 'discard' | 'revert') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: action === 'publish' ? publishTheme : action === 'discard' ? discardThemeDraft : revertTheme,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['public-menu-settings'] })
      void queryClient.invalidateQueries({ queryKey: ['public-menu'] })
    },
  })
}

// ADR 0054 — «Mis diseños» and the AI designer
const DESIGNS_KEY = ['menu-designs'] as const

export const useMenuDesigns = () => useQuery({ queryKey: DESIGNS_KEY, queryFn: listDesigns })

/** Writes to the history only: the draft and the public page stay as they are. */
export function useDesignHistoryAction() {
  const queryClient = useQueryClient()
  const done = () => void queryClient.invalidateQueries({ queryKey: DESIGNS_KEY })
  return {
    save: useMutation({ mutationFn: ({ name, design }: { name: string; design: ThemeDesign }) => saveDesign(name, design), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, ...patch }: { id: string; name?: string; favorite?: boolean }) => updateDesign(id, patch), onSuccess: done }),
    remove: useMutation({ mutationFn: deleteDesign, onSuccess: done }),
    ask: useMutation({ mutationFn: askDesigner, onSuccess: done }),
  }
}

/** Use a design as the draft, or publish it: the settings (and, when publishing, the public page) change. */
export function useDesignStateAction(action: 'use' | 'publish') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: action === 'use' ? applyDesignAsDraft : publishDesign,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DESIGNS_KEY })
      void queryClient.invalidateQueries({ queryKey: ['public-menu-settings'] })
      if (action === 'publish') void queryClient.invalidateQueries({ queryKey: ['public-menu'] })
    },
  })
}
