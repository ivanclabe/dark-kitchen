/** What «Oye Quanela» says while it thinks: it moves on every few seconds and stays on the last one. */
export const THINKING_STEPS = ['Pensando', 'Revisando tus datos', 'Armando la respuesta'] as const
export const THINKING_STEP_MS = 1800

/** The step shown `elapsed` ms after it started (stays on the last one; never loops back). */
export function thinkingStep(elapsed: number, steps: readonly string[] = THINKING_STEPS): string {
  return steps[Math.min(steps.length - 1, Math.max(0, Math.floor(elapsed / THINKING_STEP_MS)))]
}
