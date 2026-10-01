import { useSyncExternalStore } from 'react'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import type { InferenceSession, Tensor } from 'onnxruntime-web'
import type { WakeWordModels } from './wakeWordStream'

/**
 * "Oye Quanela" models (ADR 0016), downloaded once per device from the public
 * dk-voice-models bucket (cached for a year; a new version gets a new folder):
 *   melspectrogram.onnx   log-mel front end (standard DSP, written by us)
 *   speech_embedding.onnx Google speech_embedding (Apache 2.0), exported by us
 *   oye_quanela.onnx      our classifier
 * onnxruntime-web (WASM, one thread) is imported lazily, so devices without
 * hands-free never download it.
 */
export const WAKE_WORD_VERSION = 'oye-quanela-v1'
const BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/dk-voice-models/wake/${WAKE_WORD_VERSION}`
const FILES = ['melspectrogram.onnx', 'speech_embedding.onnx', 'oye_quanela.onnx'] as const

export type WakeWordModelStatus =
  | { state: 'idle' }
  | { state: 'downloading'; loaded: number; total: number }
  | { state: 'ready' }
  | { state: 'error'; message: string }

let status: WakeWordModelStatus = { state: 'idle' }
let modelsPromise: Promise<WakeWordModels> | null = null
const listeners = new Set<() => void>()

function setStatus(next: WakeWordModelStatus) {
  status = next
  listeners.forEach((l) => l())
}

export function useWakeWordModelStatus(): WakeWordModelStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
    () => status,
  )
}

/** Browser capabilities hands-free needs. */
export function isWakeWordSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof WebAssembly === 'object' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof AudioWorkletNode !== 'undefined'
  )
}

async function download(base: string, onProgress: (loaded: number, total: number) => void): Promise<Uint8Array[]> {
  const responses = await Promise.all(FILES.map((f) => fetch(`${base}/${f}`)))
  const bad = responses.find((r) => !r.ok || !r.body)
  if (bad) throw new Error(`No se pudo descargar el modelo de «Oye Quanela» (${bad.status})`)
  const total = responses.reduce((sum, r) => sum + (Number(r.headers.get('content-length')) || 0), 0)
  let loaded = 0
  return Promise.all(
    responses.map(async (res) => {
      const reader = res.body!.getReader()
      const parts: Uint8Array[] = []
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        parts.push(value)
        loaded += value.byteLength
        onProgress(loaded, Math.max(total, loaded))
      }
      const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0))
      let offset = 0
      for (const p of parts) {
        out.set(p, offset)
        offset += p.byteLength
      }
      return out
    }),
  )
}

/** Downloads the three models from `base` and opens them with onnxruntime-web. */
export async function createWakeWordModels(base: string, onProgress: (loaded: number, total: number) => void = () => {}): Promise<WakeWordModels> {
  const [bytes, ort] = await Promise.all([
    download(base, onProgress),
    import('onnxruntime-web/wasm'),
  ])
  ort.env.wasm.numThreads = 1
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl }
  const options: InferenceSession.SessionOptions = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }
  const [mel, embedding, classifier] = await Promise.all(bytes.map((b) => ort.InferenceSession.create(b, options)))

  const run = async (session: InferenceSession, data: Float32Array, dims: number[]): Promise<Float32Array> => {
    const feeds: Record<string, Tensor> = { [session.inputNames[0]]: new ort.Tensor('float32', data, dims) }
    const out = await session.run(feeds)
    return out[session.outputNames[0]].data as Float32Array
  }
  return {
    melspectrogram: (samples) => run(mel, samples, [1, samples.length]),
    embedding: (window) => run(embedding, window, [1, 76, 32, 1]),
    classifier: async (features) => (await run(classifier, features, [1, 16, 96]))[0],
  }
}

/** The loaded models (one set per page). Safe to call repeatedly. */
export function loadWakeWordModels(): Promise<WakeWordModels> {
  if (!modelsPromise) {
    setStatus({ state: 'downloading', loaded: 0, total: 0 })
    modelsPromise = createWakeWordModels(BASE, (loaded, total) => setStatus({ state: 'downloading', loaded, total })).then(
      (models) => {
        setStatus({ state: 'ready' })
        return models
      },
      (err: unknown) => {
        modelsPromise = null
        setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) })
        throw err
      },
    )
  }
  return modelsPromise
}
