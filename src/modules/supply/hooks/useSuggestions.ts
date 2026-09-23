import { useQuery } from '@tanstack/react-query'
import { listSupplySuggestions } from '../api/suggestions'

/**
 * Se invalida junto con ['ingredients'] e ['inventory-movements'] porque la
 * vista se alimenta de ambos: cualquier compra confirmada, merma o ajuste
 * cambia el ritmo de consumo y la cobertura.
 */
export const SUGGESTIONS_KEY = ['supply-suggestions'] as const

export function useSupplySuggestions() {
  return useQuery({ queryKey: SUGGESTIONS_KEY, queryFn: listSupplySuggestions })
}
