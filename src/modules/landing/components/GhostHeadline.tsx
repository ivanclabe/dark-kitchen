import clsx from 'clsx'
import { useEffect, useState, type CSSProperties } from 'react'

const LINE_1 = 'Tu cocina,'
const LINE_2_TYPED = 'más '
const LINE_2 = 'más inteligente'

interface Frame {
  line1: string
  line2: string
  /** The AI-style suggestion after the caret (faint), not typed yet. */
  ghost?: string
  /** The «Tab» key that accepts it. */
  tab?: boolean
  /** The suggestion was just accepted (it flashes once). */
  accepted?: boolean
  ms: number
}

/**
 * The script: the first line types itself, the second one gets a suggestion that is discarded, then the right
 * one, accepted with Tab. About 3.5 s; each frame stays `ms` milliseconds. The discarded suggestion is shorter than
 * «inteligente», so it never wraps where the final headline does not (no jump on phones).
 */
function buildFrames(): Frame[] {
  const frames: Frame[] = [{ line1: '', line2: '', ms: 450 }]
  for (let i = 1; i <= LINE_1.length; i++) frames.push({ line1: LINE_1.slice(0, i), line2: '', ms: LINE_1[i - 1] === ' ' ? 110 : 62 })
  frames.push({ line1: LINE_1, line2: '', ms: 260 })
  for (let i = 1; i <= LINE_2_TYPED.length; i++) frames.push({ line1: LINE_1, line2: LINE_2_TYPED.slice(0, i), ms: 70 })
  frames.push({ line1: LINE_1, line2: LINE_2_TYPED, ghost: 'ordenada', ms: 720 })
  frames.push({ line1: LINE_1, line2: LINE_2_TYPED, ms: 170 })
  frames.push({ line1: LINE_1, line2: LINE_2_TYPED, ghost: 'inteligente', tab: true, ms: 900 })
  frames.push({ line1: LINE_1, line2: LINE_2, accepted: true, ms: 2600 })
  return frames
}

const FRAMES = buildFrames()
const FINAL = FRAMES.length - 1

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * «Tu cocina, más inteligente» written as if an AI completed it: typing, a ghost suggestion, Tab to accept.
 * The full headline is laid out invisibly underneath, so nothing moves while it writes; screen readers get the
 * whole text at once (aria-label), and with reduced motion it simply appears.
 */
export function GhostHeadline({ id, className, style }: { id?: string; className?: string; style?: CSSProperties }) {
  const [index, setIndex] = useState(() => (prefersReducedMotion() ? FINAL : 0))
  const [caretOn, setCaretOn] = useState(() => !prefersReducedMotion())

  useEffect(() => {
    if (index >= FINAL) {
      if (!caretOn) return
      const id = window.setTimeout(() => setCaretOn(false), FRAMES[FINAL].ms)
      return () => window.clearTimeout(id)
    }
    const id = window.setTimeout(() => setIndex((i) => i + 1), FRAMES[index].ms)
    return () => window.clearTimeout(id)
  }, [index, caretOn])

  const frame = FRAMES[index]
  // Zero width: the caret never changes where a line wraps (the text must lay out exactly like the final one).
  const caret = (
    <span className="relative inline-block w-0">
      <span
        className={clsx(
          'absolute bottom-[0.02em] left-[0.04em] h-[0.82em] w-[0.07em] rounded-full bg-[#C2410C] transition-opacity duration-500',
          caretOn ? 'landing-caret' : 'opacity-0',
        )}
      />
    </span>
  )
  const onLine2 = frame.line2 !== ''

  return (
    <h1 id={id} aria-label={`${LINE_1} ${LINE_2}`} className={className} style={style}>
      <span aria-hidden className="grid">
        {/* The final layout, invisible: it reserves the space. */}
        <span className="invisible [grid-area:1/1]">
          {LINE_1}
          <br />
          <span>{LINE_2}</span>
        </span>
        <span className="[grid-area:1/1]">
          {frame.line1}
          {!onLine2 && caret}
          {onLine2 && (
            <>
              <br />
              {/* Deep Ember: the bright orange does not reach 3:1 on white, even this large. */}
              <span className="text-[#C2410C]">
                {frame.accepted ? (
                  <>
                    {LINE_2_TYPED}
                    <span className="landing-ghost-accept rounded-[0.12em]">{LINE_2.slice(LINE_2_TYPED.length)}</span>
                  </>
                ) : (
                  frame.line2
                )}
              </span>
              {caret}
              {frame.ghost && (
                <span className="landing-ghost relative text-[#1C1310]/20">
                  {frame.ghost}
                  {frame.tab && (
                    <span className="absolute top-1/2 left-full ml-3 hidden -translate-y-1/2 items-center gap-1 rounded-md bg-[var(--l-field)] px-2 py-1 font-sans text-[13px] font-semibold tracking-normal whitespace-nowrap text-[var(--l-soft)] sm:inline-flex">
                      Tab ⇥
                    </span>
                  )}
                </span>
              )}
            </>
          )}
        </span>
      </span>
    </h1>
  )
}
