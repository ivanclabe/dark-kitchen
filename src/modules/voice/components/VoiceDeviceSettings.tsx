import { CommandRecognitionPanel } from '@/modules/kitchen/voice/CommandRecognitionPanel'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Section } from '@/shared/ui/Section'
import { Switch } from '@/shared/ui/Switch'
import { typography } from '@/shared/ui/typography'
import { toVoiceSettings } from '@/shared/voice/catalog'
import { DeviceVoicePanel } from '@/shared/voice/DeviceVoicePanel'
import { wakeWordTuning } from '@/shared/voice/wakeWord/tuning'
import { useVoiceFlag } from '../prefs'
import { WakeWordPanel } from './WakeWordPanel'

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex max-w-md items-start justify-between gap-4">
      <div>
        <p className="text-sm text-neutral-200">{label}</p>
        <p className={typography.caption}>{hint}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  )
}

/**
 * «Oye Quanela» on this device (ADR 0033): how it listens (recognizer and
 * hands-free) and how it speaks (voice, spoken replies). Everything here is
 * per device; the account decides what is available.
 */
export function VoiceDeviceSettings() {
  const { feature } = useActiveKitchen()
  const [replies, setReplies] = useVoiceFlag('replies', true)
  const [readTyped, setReadTyped] = useVoiceFlag('readTyped', false)
  const [followUp, setFollowUp] = useVoiceFlag('followUp', true)
  const speech = feature('voice_speech')
  const commands = feature('voice_commands')
  const wakeWord = feature('voice_wake_word')
  const listens = Boolean(commands?.usable || wakeWord?.usable)

  if (!speech?.usable && !listens) {
    return <p className={typography.small}>La voz no está activa en esta cuenta: no hay nada que ajustar en este equipo.</p>
  }
  return (
    <>
      {listens && (
        <Section title="Escuchar" description="Cómo te oye Quanela en este equipo." card>
          <CommandRecognitionPanel />
          {wakeWord?.usable && (
            <div className="mt-5 border-t border-neutral-800/60 pt-5">
              <WakeWordPanel tuning={wakeWordTuning(wakeWord)} />
              <div className="mt-5">
                <Toggle
                  label="Seguir escuchando después de responder"
                  hint="Tras «Oye Quanela», puedes hacer otra pregunta sin repetir la frase. Termina si te quedas en silencio unos segundos o dices «gracias»."
                  checked={followUp}
                  onChange={setFollowUp}
                />
              </div>
            </div>
          )}
        </Section>
      )}
      {speech?.usable && (
        <Section title="Hablar" description="Con qué voz te responde Quanela en este equipo." card>
          <div className="space-y-5">
            <DeviceVoicePanel lang={toVoiceSettings(speech.settings).lang} />
            <div className="space-y-4 border-t border-neutral-800/60 pt-5">
              <Toggle
                label="Respuestas habladas"
                hint="Lee en voz alta la respuesta a lo que dices: los comandos de Cocina y las preguntas a Copilot."
                checked={replies}
                onChange={setReplies}
              />
              <Toggle
                label="Leer también lo que escribes a Copilot"
                hint="Además de las preguntas por voz, lee el resumen de las respuestas a lo que escribes."
                checked={readTyped}
                onChange={setReadTyped}
              />
            </div>
          </div>
        </Section>
      )}
    </>
  )
}
