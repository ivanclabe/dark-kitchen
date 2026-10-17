import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { BillingPeriod } from '@/shared/plans/plans'
import { BILLING_ACCESS_KEY, billingMessage, paymentStatus, returnUrl, startCheckout } from './billing'

export type ReturnState = { phase: 'idle' } | { phase: 'checking' } | { phase: 'approved' } | { phase: 'pending' } | { phase: 'declined'; message: string }

/**
 * Back from Wompi (?pago=1&id=<transaction>): ask the server what Wompi says. The
 * address bar is never trusted; a pending payment (PSE) is asked again for a while,
 * and the signed event confirms it anyway.
 */
export function usePaymentReturn(): ReturnState {
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()
  const transactionId = params.get('pago') === '1' ? params.get('id') : null
  const [state, setState] = useState<ReturnState>({ phase: 'idle' })
  const started = useRef<string | null>(null)

  useEffect(() => {
    if (!transactionId || started.current === transactionId) return
    started.current = transactionId
    setState({ phase: 'checking' })
    let cancelled = false
    ;(async () => {
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        try {
          const { status } = await paymentStatus(transactionId)
          if (status === 'APPROVED') {
            await queryClient.invalidateQueries()
            setState({ phase: 'approved' })
            break
          }
          if (status === 'DECLINED' || status === 'VOIDED' || status === 'ERROR') {
            setState({ phase: 'declined', message: 'El pago no se aprobó. Puedes intentarlo de nuevo con otro método.' })
            break
          }
          setState({ phase: 'pending' })
        } catch (err) {
          setState({ phase: 'declined', message: billingMessage(err, 'No pudimos confirmar el pago').message })
          break
        }
        await new Promise((r) => setTimeout(r, 4000))
      }
      if (!cancelled) {
        setParams(
          (p) => {
            const next = new URLSearchParams(p)
            next.delete('pago')
            next.delete('id')
            next.delete('env')
            return next
          },
          { replace: true },
        )
        void queryClient.invalidateQueries({ queryKey: BILLING_ACCESS_KEY })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transactionId, queryClient, setParams])

  return state
}

/** Go to Wompi's checkout (every method). */
export function useCheckout(organizationId: string) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = useCallback(
    async (planKey?: string, billingPeriod?: BillingPeriod) => {
      setBusy(true)
      setError(null)
      try {
        const result = await startCheckout({ organizationId, planKey, billingPeriod, redirectUrl: returnUrl(window.location) })
        if (result.applied) {
          // A small upgrade a few days before renewing: applied without a charge.
          await queryClient.invalidateQueries()
          setBusy(false)
          return
        }
        window.location.assign(result.url!)
      } catch (err) {
        setError(billingMessage(err, 'No pudimos abrir el pago').message)
        setBusy(false)
      }
    },
    [organizationId, queryClient],
  )
  return { go, busy, error }
}
