import { useEffect, useRef, useState } from 'react'
import { deviceSpeech } from '../speechQueue'
import { startCapture, type Capture } from './capture'
import { loadWakeWordModels } from './wakeWordModel'
import { WakeWordStream, type WakeWordTuning } from './wakeWordStream'

/**
 * Listens for "Oye Quanela" while `active` (ADR 0016).
 *   - `suspended` (a command is being heard or processed) releases the
 *     microphone so the command recognizer can use it; listening resumes after.
 *   - While Quanela speaks (and a short tail after), audio is ignored so her
 *     own voice never triggers it.
 *   - On detection the microphone is released at once and `onDetect` runs.
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

  useEffect(() => {
    onDetectRef.current = onDetect
    onScoreRef.current = onScore
    tuningRef.current = tuning
  })

  useEffect(() => {
    streamRef.current?.setTuning({ threshold: tuning.threshold, confirmFrames: tuning.confirmFrames })
  }, [tuning.threshold, tuning.confirmFrames])

  // A new key per run, so a previous run's outcome is never shown for this one.
  const runKey = `${generation}:${active}:${suspended}`

  useEffect(() => {
    if (!active || suspended) return
    let cancelled = false
    let capture: Capture | null = null
    let pending: Int16Array[] = []
    let draining = false
    let heardSpeech = false

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
          if (deviceSpeech.isSpeaking(SPEECH_TAIL_MS)) {
            heardSpeech = true
            continue
          }
          if (heardSpeech) {
            stream.reset()
            heardSpeech = false
          }
          const result = await stream.push(chunk)
          if (cancelled) break
          onScoreRef.current?.(result.score)
          if (result.detected) {
            cancelled = true
            pending = []
            capture?.stop()
            onDetectRef.current()
            setGeneration((g) => g + 1)
            break
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
  }, [active, suspended, generation, runKey])

  const current = run?.key === runKey ? run : null
  const state: WakeWordState = !active ? 'off' : suspended ? 'standby' : (current?.state ?? 'loading')
  return { state, error: current?.error ?? null }
}
