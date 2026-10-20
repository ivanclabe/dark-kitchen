import { RobotFace } from '@/shared/robot/RobotFace'
import type { RobotMood } from '@/shared/robot/expressions'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { typography } from './typography'

export type FeedbackTone = RobotMood

/**
 * The frame of an inline message, by tone (states on a whole screen go without a frame, except errors).
 * Translucent 500 tints: they read the same over the dark and the light theme.
 */
const INLINE_BOX: Record<FeedbackTone, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/5',
  celebrate: 'border-emerald-500/30 bg-emerald-500/5',
  thanks: 'border-emerald-500/30 bg-emerald-500/5',
  error: 'border-red-500/30 bg-red-500/5',
  warning: 'border-amber-500/30 bg-amber-500/5',
  info: 'border-neutral-800 bg-neutral-900/60',
  empty: 'border-neutral-800 bg-neutral-900/60',
  noResults: 'border-neutral-800 bg-neutral-900/60',
  idle: 'border-neutral-800 bg-neutral-900/60',
  help: 'border-neutral-800 bg-neutral-900/60',
  ai: 'border-neutral-50/25 bg-neutral-50/[0.06]',
}

/** Errors and warnings interrupt (alert); good news and progress are announced politely (status). */
function roleOf(tone: FeedbackTone, layout: 'inline' | 'block'): 'alert' | 'status' | undefined {
  if (tone === 'error' || (tone === 'warning' && layout === 'inline')) return 'alert'
  if (layout === 'inline' && (tone === 'success' || tone === 'celebrate' || tone === 'ai')) return 'status'
  return undefined
}

/**
 * A message with the robot of Quanela (ADR 0060): the tone picks the expression, the frame and the role.
 * `inline` goes inside a form or a card (robot 36 px); `block` is the state of a whole area (robot 112 px,
 * 72 px on phones; `compact` makes it 56 px). EmptyState and ErrorState are built on it.
 */
export function Feedback({
  tone,
  mood,
  title,
  description,
  action,
  children,
  layout = 'inline',
  compact = false,
  framed,
  role,
  animated = false,
  className,
}: {
  tone: FeedbackTone
  /** Another expression than the tone's (e.g. a success that celebrates). */
  mood?: RobotMood
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  children?: ReactNode
  layout?: 'inline' | 'block'
  compact?: boolean
  /** Block states have no frame by default (they live inside a card), except errors. */
  framed?: boolean
  /** Overrides the role the tone implies (e.g. `null` for static text). */
  role?: 'alert' | 'status' | null
  animated?: boolean
  className?: string
}) {
  const face = mood ?? tone
  const ariaRole = role === null ? undefined : (role ?? roleOf(tone, layout))

  if (layout === 'inline') {
    return (
      <div role={ariaRole} className={clsx('flex items-start gap-3 rounded-xl border px-3.5 py-3', INLINE_BOX[tone], className)}>
        <RobotFace mood={face} size={36} animated={animated} className="-my-0.5" />
        <div className="min-w-0 flex-1 text-sm">
          {title && <p className="font-semibold text-neutral-100">{title}</p>}
          {description && <div className={clsx('text-neutral-400', title && 'mt-0.5')}>{description}</div>}
          {children}
          {action && <div className="mt-2.5">{action}</div>}
        </div>
      </div>
    )
  }

  const boxed = framed ?? tone === 'error'
  return (
    <div
      role={ariaRole}
      className={clsx(
        'flex flex-col items-center justify-center text-center',
        boxed && clsx('rounded-2xl border', INLINE_BOX[tone]),
        compact ? 'gap-1.5 px-4 py-7' : 'gap-2 px-6 py-12',
        className,
      )}
    >
      <RobotFace
        mood={face}
        size={compact ? 56 : 112}
        lazy
        animated={animated}
        className={clsx('mb-1 w-auto', compact ? 'h-14' : 'h-[4.5rem] sm:h-28')}
      />
      {title && <p className={typography.h3}>{title}</p>}
      {description && <div className={clsx('max-w-md', typography.small)}>{description}</div>}
      {children}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
