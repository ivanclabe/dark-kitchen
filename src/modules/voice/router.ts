import type { RecognizerId } from '@/shared/voice/recognition/preference'
import type { VoiceHandler } from './types'

export type Route =
  | { kind: 'handler'; handler: VoiceHandler }
  | { kind: 'stop' }
  | { kind: 'close' }
  | { kind: 'none'; reason: 'empty' | 'offline-question' | 'no-handler' }

const STOP_WORDS = new Set(['cancela', 'cancelar', 'para', 'detente', 'silencio', 'calla', 'olvidalo', 'nada'])
/** A friendly end of the conversation (ADR 0038): Quanela says «Con gusto.» and stops listening. */
const CLOSE_PHRASES = new Set([
  'gracias', 'muchas gracias', 'listo', 'listo gracias', 'ok gracias', 'vale gracias', 'eso es todo', 'eso era todo', 'es todo', 'eso es todo gracias',
  'terminar', 'termina', 'terminamos', 'nada mas', 'nada mas gracias', 'chao', 'adios', 'hasta luego',
])

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The wake phrase sometimes slips into what is heard after it («oye quanela
 * cuánto vendimos», or as the recognizer hears it: «oye juanela…»). It is
 * removed from the start before anything else (ADR 0033).
 */
export function stripWakePhrase(text: string): string {
  let rest = text.trim()
  for (let i = 0; i < 2; i++) {
    const next = rest.replace(/^(?:(?:oye|hey|ey|ok|okey)[\s,]*)?[^\s,]*?[ckqgjhw]?u[aá]nela[\s,.!¡]*/i, '')
    if (next === rest) break
    rest = next.trim()
  }
  return rest
}

/**
 * Where a phrase goes (ADR 0033). Pure: the screens' handlers in the order
 * they were registered, Copilot as the fallback.
 *   - «cancela», «para», «silencio» alone: stop (listening, speaking, the question).
 *   - «gracias», «listo», «eso es todo» alone: close the conversation (ADR 0038).
 *   - Offline recognizer (Vosk): it only knows the kitchen's words, so only a
 *     handler with a grammar takes it; a question cannot be understood.
 *   - Otherwise the first handler that recognises it, else the fallback.
 */
export function routeUtterance(text: string, handlers: readonly VoiceHandler[], engine: RecognizerId): Route {
  const clean = normalize(text)
  if (!clean) return { kind: 'none', reason: 'empty' }
  if (STOP_WORDS.has(clean)) return { kind: 'stop' }
  if (CLOSE_PHRASES.has(clean)) return { kind: 'close' }
  if (engine === 'vosk') {
    const withGrammar = handlers.find((h) => h.grammar)
    return withGrammar ? { kind: 'handler', handler: withGrammar } : { kind: 'none', reason: 'offline-question' }
  }
  const own = handlers.find((h) => !h.fallback && h.matches?.(text))
  if (own) return { kind: 'handler', handler: own }
  const fallback = handlers.find((h) => h.fallback)
  return fallback ? { kind: 'handler', handler: fallback } : { kind: 'none', reason: 'no-handler' }
}
