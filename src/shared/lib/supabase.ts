import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getActiveKitchenId, getActiveRoleId, KITCHEN_HEADER, ROLE_HEADER } from '@/shared/kitchen/activeKitchen'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local and fill in the values.',
  )
}

/**
 * Toda petición (tablas, RPC, Storage, Edge Functions) lleva la Cuenta
 * activa en `x-dk-kitchen-id` y el rol activo en `x-dk-role-id`. Un único
 * punto: ningún servicio tiene que acordarse de filtrar por Cuenta ni por
 * rol; la RLS lo hace con estos encabezados (y los valida).
 *
 * `cache: 'no-store'`: los datos de operación (pedidos, stock, permisos)
 * nunca se sirven desde la caché HTTP del navegador. Además evita un error
 * de CORS: la API refleja el Origin sin `Vary: Origin`, y Chrome comparte la
 * caché entre puertos de localhost; una respuesta guardada desde otro puerto
 * (p. ej. al reiniciar el servidor de desarrollo) traía un
 * Access-Control-Allow-Origin distinto y el navegador la bloqueaba.
 */
export const kitchenAwareFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  const kitchenId = getActiveKitchenId()
  if (kitchenId) {
    headers.set(KITCHEN_HEADER, kitchenId)
    const roleId = getActiveRoleId()
    if (roleId) headers.set(ROLE_HEADER, roleId)
  }
  return fetch(input, { ...init, headers, cache: 'no-store' })
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, { global: { fetch: kitchenAwareFetch } })
