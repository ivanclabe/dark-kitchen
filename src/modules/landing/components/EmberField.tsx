import { useMemo, type CSSProperties } from 'react'

/** PRNG determinístico (mulberry32): las brasas quedan en el mismo lugar en cada render y cada visita. */
function seeded(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Ember {
  left: number
  top: number
  size: number
  opacity: number
  duration: number
  delay: number
  glow: boolean
}

/**
 * Fondo de brasas: la versión Dark Kitchen del cielo estrellado de la
 * referencia. Puntos naranjas que suben y titilan despacio. Decorativo
 * (aria-hidden); con "reducir movimiento" quedan quietos.
 */
export function EmberField({ count = 70, seed = 7 }: { count?: number; seed?: number }) {
  const embers = useMemo<Ember[]>(() => {
    const rand = seeded(seed)
    return Array.from({ length: count }, () => ({
      left: rand() * 100,
      top: rand() * 100,
      size: 1 + rand() * 2,
      opacity: 0.25 + rand() * 0.6,
      duration: 5 + rand() * 7,
      delay: -rand() * 12,
      glow: rand() > 0.8,
    }))
  }, [count, seed])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {embers.map((e, i) => (
        <span
          key={i}
          className="animate-ember absolute rounded-full bg-brasa-400"
          style={
            {
              left: `${e.left}%`,
              top: `${e.top}%`,
              width: e.size,
              height: e.size,
              boxShadow: e.glow ? '0 0 8px 1px var(--color-brasa-500)' : undefined,
              '--ember-opacity': e.opacity,
              '--ember-duration': `${e.duration}s`,
              '--ember-delay': `${e.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
