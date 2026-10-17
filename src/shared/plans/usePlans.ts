import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchPublicPricing, PUBLIC_PLANS_KEY, type BillingPeriod } from './plans'

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

const PERIOD_KEY = 'dk-signup-period'

/** Mensual o anual (ADR 0066): viaja como ?periodo=anual desde Precios y se recuerda en la pestaña. */
export function useSelectedPeriod(): { period: BillingPeriod; setPeriod: (period: BillingPeriod) => void } {
  const [params, setParams] = useSearchParams()
  const fromUrl = params.get('periodo')
  let stored: string | null = null
  try {
    stored = sessionStorage.getItem(PERIOD_KEY)
  } catch {
    stored = null
  }
  const period: BillingPeriod = (fromUrl ?? stored) === 'anual' ? 'annual' : 'monthly'
  const setPeriod = useCallback(
    (next: BillingPeriod) => {
      try {
        sessionStorage.setItem(PERIOD_KEY, next === 'annual' ? 'anual' : 'mensual')
      } catch {
        // La URL basta.
      }
      setParams(
        (current) => {
          const updated = new URLSearchParams(current)
          if (next === 'annual') updated.set('periodo', 'anual')
          else updated.delete('periodo')
          return updated
        },
        { replace: true },
      )
    },
    [setParams],
  )
  return { period, setPeriod }
}

/** Olvida el plan elegido (al terminar el registro). */
export function clearSelectedPlan() {
  writeStored(null)
  try {
    sessionStorage.removeItem(PERIOD_KEY)
  } catch {
    // nada que olvidar
  }
}
