/**
 * Intérprete de comandos de voz para Cocina. Función pura — sin React, sin
 * Supabase — para poder probarla de forma aislada y para que el motor de
 * voz (useVoiceCommandEngine) nunca ejecute una acción sin pasar primero
 * por aquí.
 *
 * "CONFIRM" se reconoce como acción válida del lenguaje (para no fallar en
 * silencio si alguien lo dice) aunque no exista ninguna transición legal
 * para ella dentro de Cocina — un pedido visible en el KDS ya está
 * confirmado por definición. Esa validación de negocio vive en
 * useVoiceCommandEngine, no aquí.
 */

export type VoiceAction = 'CONFIRM' | 'START_PREPARATION' | 'MARK_READY' | 'CANCEL' | 'SET_PRIORITY' | 'UNSET_PRIORITY'

export interface ParsedVoiceCommand {
  /** Código de 4 dígitos del pedido, o null si no se encontró exactamente uno. */
  orderCode: string | null
  /** Acción reconocida, o null si no hubo ninguna o hubo más de una en conflicto. */
  action: VoiceAction | null
  /**
   * 'high' solo cuando el transcript tiene exactamente un código de 4
   * dígitos Y exactamente una acción reconocida — el único caso en el que
   * el motor de voz ejecuta algo automáticamente.
   */
  confidence: 'high' | 'low'
  rawTranscript: string
}

// Orden importa: los patrones más específicos ("quitar prioridad") van
// antes que los genéricos ("prioridad") para que "quitar prioridad" no
// matchee ambos y quede ambiguo.
const ACTION_PATTERNS: { action: VoiceAction; patterns: RegExp[] }[] = [
  { action: 'UNSET_PRIORITY', patterns: [/quitar\s+prioridad/i, /no\s+prioritari[oa]/i, /sin\s+prioridad/i] },
  { action: 'SET_PRIORITY', patterns: [/prioritari[oa]/i, /\bprioridad\b/i, /\burgente\b/i] },
  { action: 'CANCEL', patterns: [/cancelad[oa]/i, /\bcancelar\b/i] },
  { action: 'MARK_READY', patterns: [/\blist[oa]\b/i, /terminad[oa]/i] },
  {
    action: 'START_PREPARATION',
    patterns: [/en\s+preparaci[oó]n/i, /\bpreparaci[oó]n\b/i, /\biniciar\b/i, /\bempezar\b/i],
  },
  { action: 'CONFIRM', patterns: [/confirmad[oa]/i, /\bconfirmar\b/i] },
]

const ORDER_CODE_PATTERN = /\b(\d{4})\b/g

function matchAction(transcript: string): VoiceAction | null {
  for (const { action, patterns } of ACTION_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(transcript))) return action
  }
  return null
}

export function parseVoiceCommand(rawTranscript: string): ParsedVoiceCommand {
  const transcript = rawTranscript.trim()
  const codes = [...transcript.matchAll(ORDER_CODE_PATTERN)].map((match) => match[1])
  const orderCode = codes.length === 1 ? (codes[0] ?? null) : null
  const action = matchAction(transcript)

  const confidence: ParsedVoiceCommand['confidence'] = orderCode !== null && action !== null ? 'high' : 'low'

  return { orderCode, action, confidence, rawTranscript }
}
