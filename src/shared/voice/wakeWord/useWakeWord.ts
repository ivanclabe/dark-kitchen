import { useEffect, useRef, useState } from 'react'
import { deviceSpeech } from '../speechQueue'
import { canShareMicrophone, silentChunk, startCapture, type Capture } from './capture'
import { loadWakeWordModels } from './wakeWordModel'
import { CHUNK_SAMPLES, WakeWordStream, type WakeWordTuning } from './wakeWordStream'

/**
 * Listens for "Oye Quanela" while `active` (ADR 0016).
 *   - `suspended` (a command is being heard or processed): it does not look
 *     for the phrase. It stays ready (ADR 0041, D6): the microphone stays
 *     open and the detector is fed silence, so it hears the phrase again the
 *     moment it resumes, with no ~2 s warm-up. Where two captures at once are
 *     not reliable (Safari), it releases the microphone as before.
 *   - While Quanela speaks (and a short tail after), it is fed silence instead
 *     of her voice: her own voice never triggers it, and it needs no warm-up after.
 *   - On detection `onDetect` runs (and, where it cannot share, the microphone
 *     is released at once).
 * Audio is processed chunk by chunk on the device and discarded.
 */
export type WakeWordState = 'off' | 'loading' | 'listening' | 'standby' | 'error'

const SPEECH_TAIL_MS = 700
/** More than 1 s of audio waiting means the device fell behind: start clean. */
const MAX_BACKLOG = 12

export function useWakeWord({
  active,
  suspended = false,
  tuning,
  onDetect,
  onScore,
}: {
  active: boolean
  suspended?: boolean
  tuning: WakeWordTuning
  onDetect: () => void
  /** Every scored chunk (12.5 per second); for the "Probar" meter. */
  onScore?: (score: number | null) => void
}) {
  // Outcome of the current listening run; 'off'/'standby'/'loading' are derived below.
  const [run, setRun] = useState<{ key: string; state: 'listening' | 'error'; error: string | null } | null>(null)
  const [generation, setGeneration] = useState(0)
  const onDetectRef = useRef(onDetect)
  const onScoreRef = useRef(onScore)
  const tuningRef = useRef(tuning)
  const streamRef = useRef<WakeWordStream | null>(null)
  const suspendedRef = useRef(suspended)
  const [shares] = useState(() => canShareMicrophone())

  useEffect(() => {
    onDetectRef.current = onDetect
    onScoreRef.current = onScore
    tuningRef.current = tuning
    suspendedRef.current = suspended
  })

  useEffect(() => {
    streamRef.current?.setTuning({ threshold: tuning.threshold, confirmFrames: tuning.confirmFrames })
  }, [tuning.threshold, tuning.confirmFrames])

  // Where the microphone cannot be shared, a suspension ends the run (as before ADR 0041).
  const releases = !shares && suspended
  // A new key per run, so a previous run's outcome is never shown for this one.
  const runKey = `${generation}:${active}:${releases}`

  useEffect(() => {
    if (!active || releases) return
    let cancelled = false
    let capture: Capture | null = null
    let pending: Int16Array[] = []
    let draining = false

    const listen = async () => {
      const models = await loadWakeWordModels()
      if (cancelled) return
      const stream = new WakeWordStream(models, tuningRef.current)
      streamRef.current = stream

      const drain = async () => {
        if (draining) return
        draining = true
        while (pending.length > 0 && !cancelled) {
          const chunk = pending.shift()!
          // Not listening for the phrase (suspended, or Quanela speaking): silence keeps it warm and clean.
          const deaf = suspendedRef.current || deviceSpeech.isSpeaking(SPEECH_TAIL_MS)
          const result = await stream.push(deaf ? silentChunk(CHUNK_SAMPLES) : chunk)
          if (cancelled) break
          onScoreRef.current?.(deaf ? null : result.score)
          if (result.detected && !deaf) {
            if (!shares) {
              cancelled = true
              pending = []
              capture?.stop()
              onDetectRef.current()
              setGeneration((g) => g + 1)
              break
            }
            onDetectRef.current()
          }
        }
        draining = false
      }

      capture = await startCapture((chunk) => {
        if (pending.length >= MAX_BACKLOG) {
          pending = []
          stream.reset()
        }
        pending.push(chunk)
        void drain()
      })
      if (cancelled) {
        capture.stop()
        return
      }
      setRun({ key: runKey, state: 'listening', error: null })
    }

    listen().catch((err: unknown) => {
      if (cancelled) return
      setRun({ key: runKey, state: 'error', error: err instanceof Error && err.message === 'not-allowed' ? 'not-allowed' : 'engine-error' })
    })

    return () => {
      cancelled = true
      capture?.stop()
      streamRef.current = null
    }
  }, [active, releases, shares, generation, runKey])

  const current = run?.key === runKey ? run : null
  const state: WakeWordState = !active ? 'off' : suspended ? 'standby' : (current?.state ?? 'loading')
  return { state, error: current?.error ?? null }
}
