import { hashKey, QueryClient, type QueryKey } from '@tanstack/react-query'
import { getActiveKitchenId, getActiveRoleId } from '@/shared/kitchen/activeKitchen'

/** Consultas que no pertenecen a una Cuenta (p. ej. el contexto del usuario). */
const GLOBAL_QUERY_ROOTS = new Set(['my-kitchens', 'public-plans'])

/**
 * La caché se separa por Cuenta y por rol activo: cada consulta se guarda
 * bajo ambos. Al cambiar de Cuenta o de rol las pantallas nunca muestran,
 * ni por un instante, datos cargados con el contexto anterior (p. ej. algo
 * que veía como Administrador y ya no ve como Cocina), sin tener que
 * agregarlos a cada queryKey. (invalidateQueries sigue funcionando por prefijo.)
 */
function kitchenScopedHash(queryKey: QueryKey): string {
  const root = typeof queryKey[0] === 'string' ? queryKey[0] : ''
  return GLOBAL_QUERY_ROOTS.has(root) ? hashKey(queryKey) : hashKey([getActiveKitchenId(), getActiveRoleId(), ...queryKey])
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      queryKeyHashFn: kitchenScopedHash,
    },
  },
})
