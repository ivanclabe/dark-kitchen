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
