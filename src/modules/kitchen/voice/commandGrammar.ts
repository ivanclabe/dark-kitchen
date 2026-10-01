import { NUMBER_WORDS } from './spokenNumbers'

/**
 * Vocabulary of kitchen voice commands for the offline recognizer (ADR
 * 0015). Vosk only returns these words (anything else becomes "[unk]"),
 * which makes short commands far more accurate and noise-tolerant than
 * open dictation. It mirrors what the command parser understands.
 */
const ACTION_WORDS = [
  'pedido',
  // MARK_READY
  'listo', 'lista', 'terminado', 'terminada',
  // START_PREPARATION
  'en', 'preparación', 'iniciar', 'empezar',
  // CANCEL
  'cancelar', 'cancelado', 'cancelada',
  // SET_PRIORITY / UNSET_PRIORITY
  'prioritario', 'prioritaria', 'prioridad', 'urgente', 'quitar', 'sin', 'no',
  // CONFIRM (recognized so it can answer that it does not apply)
  'confirmar', 'confirmado', 'confirmada',
] as const

/** Number words as the Spanish model spells them (with accents). */
const ACCENTED: Record<string, string> = {
  dieciseis: 'dieciséis', veintiun: 'veintiún', veintidos: 'veintidós', veintitres: 'veintitrés', veintiseis: 'veintiséis',
}

export const COMMAND_WORDS: readonly string[] = [...new Set([...ACTION_WORDS, ...NUMBER_WORDS.map((w) => ACCENTED[w] ?? w)])]

/** Grammar in the JSON format Vosk expects: allowed words plus "[unk]". */
export function commandGrammar(): string {
  return JSON.stringify([...COMMAND_WORDS, '[unk]'])
}
