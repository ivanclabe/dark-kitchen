import type { FeatureState } from '@/shared/features/features'
import type { WakeWordTuning } from './wakeWordStream'

/** Chosen on the evaluation set (ADR 0016, section 10); the platform can tune it (feature voice_wake_word). */
export const DEFAULT_WAKE_WORD_TUNING: WakeWordTuning = { threshold: 0.9, confirmFrames: 2 }

export function wakeWordTuning(state: FeatureState | null | undefined): WakeWordTuning {
  const s = state?.settings ?? {}
  return {
    threshold: typeof s.threshold === 'number' ? s.threshold : DEFAULT_WAKE_WORD_TUNING.threshold,
    confirmFrames: typeof s.confirm_frames === 'number' ? Math.round(s.confirm_frames) : DEFAULT_WAKE_WORD_TUNING.confirmFrames,
  }
}
