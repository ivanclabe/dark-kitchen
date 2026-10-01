import { useSyncExternalStore } from 'react'
import type { Model } from 'vosk-browser'

/**
 * Offline Spanish model for Vosk (ADR 0015). ~40 MB, downloaded once per
 * device from the public dk-voice-models bucket (cached for a year by the
 * browser). The vosk-browser library itself (~6 MB) is imported lazily, so
 * devices that never choose Vosk never download either.
 */
export const VOSK_MODEL_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/dk-voice-models/es/vosk-model-small-es-0.42.tar.gz`
export const VOSK_MODEL_BYTES = 39_816_613

export type VoskModelStatus =
  | { state: 'idle' }
  | { state: 'downloading'; loaded: number; total: number }
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; message: string }

let status: VoskModelStatus = { state: 'idle' }
let modelPromise: Promise<Model> | null = null
const listeners = new Set<() => void>()

function setStatus(next: VoskModelStatus) {
  status = next
  listeners.forEach((l) => l())
}

export function useVoskModelStatus(): VoskModelStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
    () => status,
  )
}

/** Browser capabilities the offline engine needs. */
export function isVoskSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof WebAssembly === 'object' &&
    typeof Worker !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof (window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext) !== 'undefined'
  )
}

/** Downloads the archive with progress so the worker then reads it from the HTTP cache. */
async function prefetch(): Promise<void> {
  const res = await fetch(VOSK_MODEL_URL)
  if (!res.ok || !res.body) throw new Error(`No se pudo descargar el modelo de voz (${res.status})`)
  const total = Number(res.headers.get('content-length')) || VOSK_MODEL_BYTES
  const reader = res.body.getReader()
  let loaded = 0
  setStatus({ state: 'downloading', loaded, total })
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    loaded += value.byteLength
    setStatus({ state: 'downloading', loaded, total })
  }
}

/** The loaded model (one per page). Safe to call repeatedly. */
export function loadVoskModel(): Promise<Model> {
  if (!modelPromise) {
    modelPromise = (async () => {
      try {
        await prefetch()
        setStatus({ state: 'loading' })
        const { createModel } = await import('vosk-browser')
        const model = await createModel(VOSK_MODEL_URL, -1)
        setStatus({ state: 'ready' })
        return model
      } catch (err) {
        modelPromise = null
        setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) })
        throw err
      }
    })()
  }
  return modelPromise
}
