import { robotSrc } from '@/shared/robot/expressions'
import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { finishBrandIntro, useBrandIntroRequested } from './brandIntroState'

/** When the intro starts to leave on its own (ms), and how long leaving takes. */
const HOLD_MS = 2800
const HOLD_REDUCED_MS = 900
const LEAVE_MS = 450
const LEAVE_REDUCED_MS = 200
const ROBOT_HAPPY = robotSrc('happy', 128)
const ROBOT_WINK = robotSrc('wink', 128)
/** The brand wordmark «quanela» (docs/brand/quanela-wordmark.png), used as a mask so it takes the theme's text colour. */
const WORDMARK = '/brand/quanela-wordmark.webp'

function matches(query: string) {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches
}

/**
 * Welcome after signing in (ADR 0070), in the spirit of ElevenLabs' intro: the robot appears
 * with a neon rim of light, then a living gradient grows behind it while «Quanela» slides out
 * next to it. The gradient leans towards the pointer and the robot follows it with its head;
 * a click, a tap or Escape/Enter/Space skips it. The app loads underneath meanwhile, so the
 * jump from the login to the board is covered.
 *
 * Purely visual (aria-hidden), plus a polite status for screen readers. Never steals focus.
 */
export function BrandIntro() {
  const requested = useBrandIntroRequested()
  return requested ? <BrandIntroOverlay /> : null
}

function BrandIntroOverlay() {
  const [reduced] = useState(() => matches('(prefers-reduced-motion: reduce)'))
  const [leaving, setLeaving] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const wordmarkRef = useRef<HTMLSpanElement>(null)
  const followBlobRef = useRef<HTMLDivElement>(null)
  const followMarkRef = useRef<HTMLDivElement>(null)

  // The robot starts centred alone: the row is shifted by half of what the wordmark adds.
  useLayoutEffect(() => {
    const row = rowRef.current
    const wordmark = wordmarkRef.current
    if (!row || !wordmark) return
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0
    row.style.setProperty('--brand-intro-shift', `${(wordmark.offsetWidth + gap) / 2}px`)
  }, [])

  useEffect(() => {
    const hold = window.setTimeout(() => setLeaving(true), reduced ? HOLD_REDUCED_MS : HOLD_MS)
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') setLeaving(true)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(hold)
      window.removeEventListener('keydown', onKey)
    }
  }, [reduced])

  useEffect(() => {
    if (!leaving) return
    const done = window.setTimeout(finishBrandIntro, reduced ? LEAVE_REDUCED_MS : LEAVE_MS)
    return () => window.clearTimeout(done)
  }, [leaving, reduced])

  // Pointer follow: eased towards the pointer each frame, transform only, on wrappers the CSS
  // animations do not touch. Mouse and trackpad only (a finger has no "where it is").
  useEffect(() => {
    if (reduced || !matches('(pointer: fine)')) return
    let targetX = 0
    let targetY = 0
    let x = 0
    let y = 0
    let frame = 0
    function tick() {
      x += (targetX - x) * 0.08
      y += (targetY - y) * 0.08
      if (followBlobRef.current) followBlobRef.current.style.transform = `translate3d(${x * 14}vmin, ${y * 14}vmin, 0)`
      if (followMarkRef.current) followMarkRef.current.style.transform = `translate3d(${x * 8}px, ${y * 8}px, 0) rotate(${x * 12}deg)`
      frame = Math.abs(targetX - x) + Math.abs(targetY - y) > 0.001 ? requestAnimationFrame(tick) : 0
    }
    function onMove(e: PointerEvent) {
      targetX = e.clientX / window.innerWidth - 0.5
      targetY = e.clientY / window.innerHeight - 0.5
      if (!frame) frame = requestAnimationFrame(tick)
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(frame)
    }
  }, [reduced])

  return (
    <div
      data-testid="brand-intro"
      className={clsx('brand-intro fixed inset-0 z-[100] grid cursor-default place-items-center overflow-hidden bg-neutral-950 select-none', leaving && 'brand-intro-leaving')}
      onPointerDown={() => setLeaving(true)}
    >
      <p role="status" className="sr-only">
        Entrando a quanela
      </p>
      <div className="brand-intro-stage relative grid size-full place-items-center" aria-hidden>
        <div ref={followBlobRef} className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="brand-intro-blob relative aspect-square w-[min(115vmin,1100px)]">
            <span className="brand-intro-orb brand-intro-orb-a" />
            <span className="brand-intro-orb brand-intro-orb-b" />
            <span className="brand-intro-orb brand-intro-orb-c" />
            <span className="brand-intro-orb brand-intro-orb-d" />
          </div>
        </div>

        <div ref={rowRef} className="brand-intro-row relative flex items-center gap-4 sm:gap-5">
          <div ref={followMarkRef} className="shrink-0">
            <div className="brand-intro-mark relative aspect-[366/328] h-24 sm:h-32">
              <span className="brand-intro-glow absolute -inset-3" style={{ maskImage: `url(${ROBOT_HAPPY})`, WebkitMaskImage: `url(${ROBOT_HAPPY})` }}>
                <span className="brand-intro-glow-light absolute -inset-1/2" />
              </span>
              <img src={ROBOT_HAPPY} alt="" draggable={false} className="brand-intro-happy absolute inset-0 size-full object-contain" />
              <img src={ROBOT_WINK} alt="" draggable={false} className="brand-intro-wink absolute inset-0 size-full object-contain" />
            </div>
          </div>
          <span
            ref={wordmarkRef}
            className="brand-intro-wordmark block shrink-0 aspect-[1431/353] h-11 bg-neutral-50 sm:h-20"
            style={{ maskImage: `url(${WORDMARK})`, WebkitMaskImage: `url(${WORDMARK})` }}
          />
        </div>
      </div>
    </div>
  )
}
