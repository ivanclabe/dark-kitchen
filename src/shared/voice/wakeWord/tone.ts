/** Short rising two-note tone: "I heard you, go ahead" (ADR 0016, D6). Resolves when it ends. */
export function playWakeTone(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const context = new AudioContext()
      const gain = context.createGain()
      gain.connect(context.destination)
      const t = context.currentTime
      ;[660, 990].forEach((freq, i) => {
        const osc = context.createOscillator()
        osc.frequency.value = freq
        osc.connect(gain)
        osc.start(t + i * 0.09)
        osc.stop(t + i * 0.09 + 0.08)
      })
      gain.gain.setValueAtTime(0.12, t)
      setTimeout(() => {
        void context.close()
        resolve()
      }, 220)
    } catch {
      // Sound is an extra on top of the visual cue.
      resolve()
    }
  })
}

/** One soft note: «still listening» for the next question of a conversation (ADR 0038). */
export function playFollowUpTone(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const context = new AudioContext()
      const gain = context.createGain()
      gain.connect(context.destination)
      const t = context.currentTime
      const osc = context.createOscillator()
      osc.frequency.value = 880
      osc.connect(gain)
      osc.start(t)
      osc.stop(t + 0.07)
      gain.gain.setValueAtTime(0.06, t)
      setTimeout(() => {
        void context.close()
        resolve()
      }, 120)
    } catch {
      resolve()
    }
  })
}
