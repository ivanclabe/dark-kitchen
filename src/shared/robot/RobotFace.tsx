import clsx from 'clsx'
import { MOOD_EXPRESSION, ROBOT_EXPRESSIONS, robotSrc, type RobotMood } from './expressions'

/**
 * The robot with the expression of a mood (ADR 0060). `size` is its height in px (it also picks the file);
 * the width follows the original's proportion. Decorative: the meaning is in the text next to it.
 * `className` can resize it responsively (e.g. `h-16 sm:h-28 w-auto`).
 */
export function RobotFace({
  mood,
  size = 32,
  lazy = false,
  animated = false,
  className,
}: {
  mood: RobotMood
  size?: number
  lazy?: boolean
  /** A gentle bob for long work (AI); off when the system asks for reduced motion. */
  animated?: boolean
  className?: string
}) {
  const expression = MOOD_EXPRESSION[mood]
  return (
    <img
      src={robotSrc(expression, size)}
      width={Math.round(size * ROBOT_EXPRESSIONS[expression])}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      loading={lazy ? 'lazy' : undefined}
      decoding="async"
      data-robot={expression}
      className={clsx('shrink-0 select-none object-contain', animated && 'motion-safe:animate-robot-bob', className)}
    />
  )
}
