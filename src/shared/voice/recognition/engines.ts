import type { RecognizerId } from './preference'
import { isVoskSupported, loadVoskModel } from './voskModel'

/**
 * Speech-recognition engines behind one interface (ADR 0015), like the
 * speech output engines of ADR 0014. They only deliver transcripts; the
 * kitchen decides what a transcript means.
 */
export interface RecognitionCallbacks {
  /** Full transcript so far (final + partial), every time it changes. */
  onTranscript: (text: string) => void
  onStart: () => void
  onEnd: () => void
  onError: (code: string) => void
}

export interface RecognitionSession {
  stop: () => void
}

export interface RecognitionEngine {
  id: RecognizerId
  supported: () => boolean
  start: (options: { lang: string; grammar?: string } & RecognitionCallbacks) => Promise<RecognitionSession>
}

const BrowserSpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition ?? window.webkitSpeechRecognition) : undefined

/** Web Speech API: what Quanela used until ADR 0015 (needs internet in Chrome). */
export const browserEngine: RecognitionEngine = {
  id: 'browser',
  supported: () => !!BrowserSpeechRecognition,
  async start({ lang, onTranscript, onStart, onEnd, onError }) {
    if (!BrowserSpeechRecognition) throw new Error('not-supported')
    const recognition = new BrowserSpeechRecognition()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.onstart = onStart
    recognition.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i]?.[0]?.transcript ?? ''
      onTranscript(text.trim())
    }
    recognition.onerror = (e) => onError(e.error)
    recognition.onend = onEnd
    recognition.start()
    return { stop: () => recognition.stop() }
  },
}

const clean = (text: string) => text.replace(/\[unk\]/g, ' ').replace(/\s+/g, ' ').trim()

/** Vosk in WebAssembly: offline, private, limited to the command vocabulary. */
export const voskEngine: RecognitionEngine = {
  id: 'vosk',
  supported: isVoskSupported,
  async start({ grammar, onTranscript, onStart, onEnd, onError }) {
    const model = await loadVoskModel()
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
    } catch {
      throw new Error('not-allowed')
    }
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const context = new AudioCtx()
    const recognizer = new model.KaldiRecognizer(context.sampleRate, grammar)
    let finalText = ''
    let partial = ''
    const emit = () => onTranscript(clean(`${finalText} ${partial}`))
    recognizer.on('result', (message) => {
      if (message.event !== 'result') return
      finalText = clean(`${finalText} ${message.result.text}`)
      partial = ''
      emit()
    })
    recognizer.on('partialresult', (message) => {
      if (message.event !== 'partialresult') return
      partial = message.result.partial
      emit()
    })
    recognizer.on('error', (message) => {
      if (message.event === 'error') onError(message.error)
    })

    const source = context.createMediaStreamSource(stream)
    // ScriptProcessor is what vosk-browser documents; it hands AudioBuffers to the worker.
    const processor = context.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (event) => {
      try {
        recognizer.acceptWaveform(event.inputBuffer)
      } catch {
        // A dropped chunk only loses a few milliseconds of audio.
      }
    }
    source.connect(processor)
    processor.connect(context.destination)
    onStart()

    let stopped = false
    return {
      stop: () => {
        if (stopped) return
        stopped = true
        processor.disconnect()
        source.disconnect()
        stream.getTracks().forEach((t) => t.stop())
        recognizer.retrieveFinalResult()
        // Give the worker a moment to return the last words, then clean up.
        setTimeout(() => {
          recognizer.remove()
          void context.close()
          onEnd()
        }, 300)
      },
    }
  },
}

export function engineFor(id: RecognizerId): RecognitionEngine {
  return id === 'vosk' ? voskEngine : browserEngine
}
