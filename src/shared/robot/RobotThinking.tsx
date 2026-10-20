import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { RobotFace } from './RobotFace'
import { THINKING_STEP_MS, THINKING_STEPS } from './thinking'

function useThinkingStep(steps: readonly string[]): string {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (steps.length < 2) return
    const timer = window.setInterval(() => setIndex((i) => Math.min(i + 1, steps.length - 1)), THINKING_STEP_MS)
    return () => window.clearInterval(timer)
  }, [steps])
  return steps[Math.min(index, steps.length - 1)]
}

/**
 * The robot of Quanela thinking: its face inside a ring that orbits, three
 * sparks that light up in turn, and a line that says what it is doing with a
 * light sweeping across it. `size` is the robot's height; `steps` the phrases
 * (one phrase = no change). Decorative except the text, which is announced by
 * whoever shows it.
 */
export function RobotThinking({
  size = 28,
  steps = THINKING_STEPS,
  showText = true,
  className,
  textClassName,
}: {
  size?: number
  steps?: readonly string[]
  showText?: boolean
  className?: string
  textClassName?: string
}) {
  const step = useThinkingStep(steps)
  const ring = size + 10
  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: ring, height: ring }} aria-hidden>
        {/* The orbit: a bright arc that turns around the head. */}
        <span
          className="absolute inset-0 rounded-full motion-safe:animate-think-orbit"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0deg, transparent 220deg, var(--color-neutral-50) 320deg, var(--color-neutral-50) 360deg)',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))',
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))',
          }}
        />
        <span className="absolute inset-[3px] rounded-full bg-neutral-50/10 ring-1 ring-neutral-50/20" />
        <RobotFace mood="ai" size={size - 4} animated className="relative" />
      </span>
      {showText && (
        <span className={clsx('inline-flex items-center gap-1.5', textClassName)}>
          <span key={step} className="text-think-shimmer motion-safe:animate-think-swap font-medium">
            {step}
          </span>
          <span className="inline-flex items-center gap-0.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1 rounded-full bg-neutral-50 motion-safe:animate-think-spark" style={{ animationDelay: `${i * 0.18}s` }} />
            ))}
          </span>
        </span>
      )}
    </span>
  )
}
