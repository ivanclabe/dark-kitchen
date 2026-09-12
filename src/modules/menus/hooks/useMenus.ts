import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createMenu, listMenus, setMenuActive } from '../api/menus'
import {
  addMenuItem,
  listMenuItems,
  removeMenuItem,
  setMenuItemActive,
  updateMenuItem,
} from '../api/menuItems'
import { getTodayMenu, setTodayAvailability } from '../api/todayMenu'
import type { MenuItemInput } from '../types'

export function useMenus() {
  return useQuery({ queryKey: ['menus'], queryFn: listMenus })
}

export function useCreateMenu() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) => createMenu(name, description),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menus'] }),
  })
}

export function useSetMenuActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setMenuActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menus'] }),
  })
}

export function useMenuItems(menuId: string) {
  return useQuery({ queryKey: ['menu-items', menuId], queryFn: () => listMenuItems(menuId), enabled: !!menuId })
}

export function useAddMenuItem(menuId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: MenuItemInput) => addMenuItem(menuId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-items', menuId] }),
  })
}

export function useUpdateMenuItem(menuId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MenuItemInput }) => updateMenuItem(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-items', menuId] }),
  })
}

export function useSetMenuItemActive(menuId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setMenuItemActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-items', menuId] }),
  })
}

export function useRemoveMenuItem(menuId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => removeMenuItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-items', menuId] }),
  })
}

export function useTodayMenu() {
  return useQuery({ queryKey: ['today-menu'], queryFn: getTodayMenu })
}

export function useSetTodayAvailability() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ menuItemId, available }: { menuItemId: string; available: boolean }) =>
      setTodayAvailability(menuItemId, available),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['today-menu'] }),
  })
}
