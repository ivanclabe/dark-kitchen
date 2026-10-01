import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { rangeFor, RANGE_DAYS, type RangeKey } from './format'

/** Date range kept in the URL (?range=7d|30d|90d), 30 days by default. */
export function useRange(): { key: RangeKey; from: string; to: string; setKey: (k: RangeKey) => void } {
  const [params, setParams] = useSearchParams()
  const requested = params.get('range') as RangeKey | null
  const key: RangeKey = requested && requested in RANGE_DAYS ? requested : '30d'
  const { from, to } = useMemo(() => rangeFor(key), [key])
  return {
    key,
    from,
    to,
    setKey: (k) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('range', k)
          return next
        },
        { replace: true },
      ),
  }
}
