import { supabase } from './supabase'

/**
 * Ruta de un archivo en el bucket dk-attachments: `kitchens/{cocina}/{carpeta}/{id}/…`.
 * La RLS de Storage solo deja leer y escribir bajo la carpeta de la Cocina
 * activa (ADR 0007, Fase 3), así que la Cocina la resuelve el servidor.
 */
export async function kitchenFilePath(folder: string, entityId: string, fileName: string): Promise<string> {
  const { data: kitchenId, error } = await supabase.rpc('dk_current_kitchen_id')
  if (error) throw error
  if (!kitchenId) throw new Error('No hay una cuenta activa para guardar el archivo.')
  return `kitchens/${kitchenId}/${folder}/${entityId}/${Date.now()}-${fileName}`
}
