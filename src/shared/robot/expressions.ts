/**
 * The robot of Quanela (ADR 0060): its expressions and what each one is for. Screens ask for a purpose
 * (`RobotMood`), never for a file, so changing an expression is one line here.
 *
 * Files: public/robot/robot-<expression>-{sm,lg}.webp, generated from docs/brand/robot by
 * scripts/robot-icons.sh. `sm` is 96 px tall (up to 48 px on screen), `lg` 288 px (empty states).
 */

/**
 * Width ÷ height of each original (some carry a symbol on the side: «!», «?», a bulb, «zZ»). The originals are cut
 * from the brand sheet with the whole hat and a margin (docs/brand/robot).
 */
export const ROBOT_EXPRESSIONS = {
  happy: 366 / 328,
  excited: 365 / 329,
  wink: 368 / 322,
  surprised: 323 / 327,
  astonished: 355 / 328,
  confused: 359 / 325,
  idea: 410 / 321,
  sleeping: 397 / 321,
  'in-love': 377 / 325,
  angry: 388 / 328,
} as const

export type RobotExpression = keyof typeof ROBOT_EXPRESSIONS

/** What the robot is telling the user. */
export type RobotMood =
  | 'success'
  | 'celebrate'
  | 'error'
  | 'warning'
  | 'info'
  | 'help'
  | 'ai'
  | 'empty'
  | 'noResults'
  | 'idle'
  | 'thanks'

/**
 * Purpose → expression. `angry` has no purpose on purpose: next to an error it reads as blaming the user.
 * There is no "thinking" face in the pack, so AI work uses `idea`.
 */
export const MOOD_EXPRESSION: Record<RobotMood, RobotExpression> = {
  success: 'happy',
  celebrate: 'excited',
  error: 'surprised',
  warning: 'astonished',
  info: 'wink',
  help: 'idea',
  ai: 'idea',
  empty: 'wink',
  noResults: 'confused',
  idle: 'sleeping',
  thanks: 'in-love',
}

/** Up to this height on screen the small file is enough (96 px covers 2× screens). */
const SMALL_MAX = 48

export function robotSrc(expression: RobotExpression, size: number): string {
  return `/robot/robot-${expression}-${size <= SMALL_MAX ? 'sm' : 'lg'}.webp`
}
