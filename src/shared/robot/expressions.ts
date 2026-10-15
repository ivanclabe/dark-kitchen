/**
 * The robot of Quanela (ADR 0060): its expressions and what each one is for. Screens ask for a purpose
 * (`RobotMood`), never for a file, so changing an expression is one line here.
 *
 * Files: public/robot/robot-<expression>-{sm,lg}.webp, generated from docs/brand/robot by
 * scripts/robot-icons.sh. `sm` is 96 px tall (up to 48 px on screen), `lg` 288 px (empty states).
 */

/** Width ÷ height of each original (some carry a symbol on the side: «!», «?», a bulb, «zZ»). */
export const ROBOT_EXPRESSIONS = {
  happy: 361 / 332,
  excited: 369 / 316,
  wink: 372 / 326,
  surprised: 327 / 331,
  astonished: 359 / 332,
  confused: 363 / 329,
  idea: 414 / 313,
  sleeping: 401 / 309,
  'in-love': 368 / 308,
  angry: 392 / 313,
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
