import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchPublicPricing, PUBLIC_PLANS_KEY } from './plans'

/** Planes y catálogo de funciones públicos (sin sesión). */
export function usePublicPricing() {
  return useQuery({ queryKey: PUBLIC_PLANS_KEY, queryFn: fetchPublicPricing, staleTime: 5 * 60_000 })
}

const STORAGE_KEY = 'dk-signup-plan'

function readStored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStored(plan: string | null) {
  try {
    if (plan) sessionStorage.setItem(STORAGE_KEY, plan)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // sessionStorage puede no estar disponible (modo privado) — la URL basta.
  }
}

/**
 * Plan elegido durante el registro (ADR 0010, 3.4): viaja en la URL
 * (?plan=business) y se recuerda en la pestaña (sobrevive a recargar). La
 * base vuelve a validarlo al crear la organización.
 */
export function useSelectedPlan(): { plan: string | null; setPlan: (plan: string | null) => void } {
  const [params, setParams] = useSearchParams()
  const fromUrl = params.get('plan')
  const plan = fromUrl ?? readStored()

  const setPlan = useCallback(
    (next: string | null) => {
      writeStored(next)
      setParams(
        (current) => {
          const updated = new URLSearchParams(current)
          if (next) updated.set('plan', next)
          else updated.delete('plan')
          return updated
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return { plan, setPlan }
}

/** Olvida el plan elegido (al terminar el registro). */
export function clearSelectedPlan() {
  writeStored(null)
}
