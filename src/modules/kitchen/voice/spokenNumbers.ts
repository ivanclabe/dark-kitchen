/**
 * Spoken Spanish numbers → digits, for order codes (ADR 0015).
 *
 * Offline recognizers (Vosk) return words ("pedido dos mil cuarenta
 * listo"), while the command parser expects a 4-digit code. This rewrites
 * each run of number words into digits when it forms exactly 4 digits,
 * covering the ways codes are said in a kitchen:
 *   - cardinal:        "dos mil cuarenta" → 2040, "mil cuarenta y dos" → 1042
 *   - pairs:           "veinte cuarenta" → 2040, "diez cero cinco" → 1005
 *   - digit by digit:  "dos cero cuatro cero" → 2040
 * Anything else is left as is (the parser then answers "No entendí").
 * Pure function: no React, no browser APIs.
 */

const UNITS: Record<string, number> = {
  uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
}
const TEENS_AND_TWENTIES: Record<string, number> = {
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veintiuno: 21, veintiun: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29,
}
const TENS: Record<string, number> = {
  veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
}
const HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800,
  ochocientas: 800, novecientos: 900, novecientas: 900,
}

/** Every number word the recognizer may return (accent-free keys). */
export const NUMBER_WORDS: readonly string[] = ['cero', 'mil', 'y', ...Object.keys(UNITS), ...Object.keys(TEENS_AND_TWENTIES), ...Object.keys(TENS), ...Object.keys(HUNDREDS)]

const normalize = (word: string) => word.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

function isNumberWord(word: string): boolean {
  const w = normalize(word)
  return w === 'cero' || w === 'mil' || w in UNITS || w in TEENS_AND_TWENTIES || w in TENS || w in HUNDREDS
}

type Kind = 'start' | 'thousand' | 'hundred' | 'ten' | 'unit'

/**
 * Reads one cardinal number from `words[start]` as far as Spanish grammar
 * allows ("dos mil cuarenta y dos" is one number; "veinte cuarenta" is two).
 * Returns its digits and the index after it.
 */
function readCardinal(words: readonly string[], start: number): { digits: string; next: number } {
  if (words[start] === 'cero') return { digits: '0', next: start + 1 }
  let total = 0
  let current = 0
  let last: Kind = 'start'
  let seenThousand = false
  let i = start
  while (i < words.length) {
    const w = words[i]
    if (w === 'mil') {
      if (seenThousand) break
      total += (current || 1) * 1000
      current = 0
      seenThousand = true
      last = 'thousand'
    } else if (w in HUNDREDS) {
      if (current > 0 || last === 'hundred') break
      current += HUNDREDS[w]
      last = 'hundred'
    } else if (w in TENS) {
      if (current % 100 !== 0) break
      current += TENS[w]
      last = 'ten'
    } else if (w === 'y') {
      // "treinta y dos": only between a ten and a unit.
      const unit = words[i + 1]
      if (last !== 'ten' || !unit || !(unit in UNITS)) break
      current += UNITS[unit]
      last = 'unit'
      i += 1
    } else if (w in TEENS_AND_TWENTIES) {
      if (current % 100 !== 0) break
      current += TEENS_AND_TWENTIES[w]
      last = 'unit'
    } else if (w in UNITS) {
      // After a ten the "y" is optional: recognizers often drop that short word
      // ("cuarenta dos" = 42). After a hundred or thousand it is fine too ("ciento cinco").
      if (last === 'unit' || (current % 10 !== 0) || (current % 100 !== 0 && last !== 'ten')) break
      current += UNITS[w]
      last = 'unit'
    } else {
      break
    }
    i += 1
  }
  return { digits: String(total + current), next: i }
}

/** Digits for a run of number words, or null when it does not form a 4-digit code. */
export function numberRunToCode(run: readonly string[]): string | null {
  const words = run.map(normalize)
  let digits = ''
  let i = 0
  while (i < words.length) {
    if (words[i] === 'y') return null // a loose "y" is not part of a code
    const { digits: part, next } = readCardinal(words, i)
    if (next === i) return null
    digits += part
    i = next
  }
  return /^\d{4}$/.test(digits) ? digits : null
}

/** Rewrites every run of spoken number words that forms a 4-digit code into digits. */
export function spokenNumbersToDigits(text: string): string {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  const out: string[] = []
  let i = 0
  while (i < tokens.length) {
    if (!isNumberWord(tokens[i]) || normalize(tokens[i]) === 'y') {
      out.push(tokens[i])
      i += 1
      continue
    }
    let j = i
    // A run is consecutive number words; "y" only counts between two of them.
    const joins = (k: number) => normalize(tokens[k]) === 'y' && k + 1 < tokens.length && isNumberWord(tokens[k + 1])
    while (j < tokens.length && (isNumberWord(tokens[j]) || joins(j))) j += 1
    const run = tokens.slice(i, j)
    const code = numberRunToCode(run)
    out.push(...(code ? [code] : run))
    i = j
  }
  return out.join(' ')
}
