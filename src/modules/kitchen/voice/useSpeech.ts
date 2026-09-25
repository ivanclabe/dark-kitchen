import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useCallback } from 'react'
import { speak } from './speak'

/**
 * Única puerta para que la app hable (ADR 0009). Primero la función "Voz de
 * la aplicación" (organización ∧ Cuenta ∧ permiso, lo decide la base); luego
 * cada llamador suma lo suyo (preferencia del equipo, parámetro `voice` de
 * una función de IA), que solo puede apagar, nunca encender.
 */
export function useSpeech() {
  const { canUseFeature } = useActiveKitchen()
  const allowed = canUseFeature('voice_speech')
  const say = useCallback(
    (text: string) => {
      if (allowed) speak(text)
    },
    [allowed],
  )
  return { allowed, say }
}
