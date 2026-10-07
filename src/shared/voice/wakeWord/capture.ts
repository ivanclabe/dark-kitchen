import workletUrl from './captureWorklet.js?url&no-inline'

/**
 * Opens the microphone and delivers 80 ms chunks at 16 kHz (ADR 0016). The
 * audio never leaves the device: chunks go straight to the detector and are
 * dropped. Echo cancellation keeps Quanela's own voice out; noise suppression
 * stays off because the model was trained on unprocessed audio.
 */
export interface Capture {
  stop: () => void
}

/**
 * Can the detector keep its microphone while the recognizer opens its own
 * (ADR 0041, D6)? Chromium and Firefox handle two captures at once; Safari
 * (macOS and every iOS browser, which are Safari underneath) is not reliable
 * with it, so there the detector releases the microphone as before.
 */
export function canShareMicrophone(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent, touchPoints = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints): boolean {
  const ios = /iP(hone|ad|od)/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)
  const safari = /Safari\//.test(userAgent) && !/(Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android)\//.test(userAgent)
  return !ios && !safari
}

/** One chunk of near silence (a little noise, not exact zeros, so the log-mel stays in range). */
export function silentChunk(samples: number): Int16Array {
  const chunk = new Int16Array(samples)
  for (let i = 0; i < samples; i++) chunk[i] = Math.round((Math.random() - 0.5) * 4)
  return chunk
}

export async function startCapture(onChunk: (chunk: Int16Array) => void): Promise<Capture> {
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: true },
    })
  } catch {
    throw new Error('not-allowed')
  }
  const context = new AudioContext()
  try {
    await context.audioWorklet.addModule(workletUrl)
    const source = context.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(context, 'wake-word-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 })
    // Silent output to the speakers keeps the node in the rendering graph on every browser.
    const mute = context.createGain()
    mute.gain.value = 0
    node.port.onmessage = (event: MessageEvent<Int16Array>) => onChunk(event.data)
    source.connect(node)
    node.connect(mute)
    mute.connect(context.destination)
    if (context.state === 'suspended') await context.resume()

    let stopped = false
    return {
      stop: () => {
        if (stopped) return
        stopped = true
        node.port.onmessage = null
        source.disconnect()
        node.disconnect()
        mute.disconnect()
        stream.getTracks().forEach((t) => t.stop())
        void context.close()
      },
    }
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop())
    void context.close()
    throw err
  }
}
