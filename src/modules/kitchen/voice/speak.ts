/**
 * Wrapper de speechSynthesis (texto a voz). Cancela cualquier locución en
 * curso antes de emitir la nueva en vez de encolar — evita que los avisos
 * se superpongan/acumulen en hora pico (varios comandos seguidos).
 */
export function speak(text: string, lang = 'es-CO') {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  try {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    window.speechSynthesis.speak(utterance)
  } catch {
    // TTS es un extra sobre el feedback visual, nunca debe romper el flujo.
  }
}
