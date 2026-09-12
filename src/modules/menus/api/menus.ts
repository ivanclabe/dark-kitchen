import { supabase } from '@/shared/lib/supabase'
import type { Menu } from '../types'

export async function listMenus(): Promise<Menu[]> {
  const { data, error } = await supabase.from('dk_menus').select('id, name, description, active').order('name')
  if (error) throw error
  return data
}

export async function createMenu(name: string, description?: string): Promise<Menu> {
  const { data, error } = await supabase
    .from('dk_menus')
    .insert({ name, description: description || null })
    .select('id, name, description, active')
    .single()
  if (error) throw error
  return data
}

export async function setMenuActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('dk_menus').update({ active }).eq('id', id)
  if (error) throw error
}
