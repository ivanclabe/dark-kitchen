import { Button } from '@/shared/ui/Button'
import { Select } from '@/shared/ui/FormField'
import { typography } from '@/shared/ui/typography'
import clsx from 'clsx'
import { Play, Volume2 } from 'lucide-react'
import { useId } from 'react'
import {
  VOICE_GENDER_LABEL,
  VOICE_LANG_LABEL,
  VOICE_LANGS,
  VOICE_RATE,
  VOICE_STYLE_META,
  VOICE_STYLES,
  VOICE_VOLUME,
  type KitchenVoiceSettings,
  type VoiceLang,
  type VoiceProfile,
  type VoiceStyle,
} from './catalog'
import { previewVoice, useDeviceVoices, useEffectiveVoice } from './hooks'
import { kitchenPhrases } from './kitchenPhrases'
import { voicesForLang, type VoiceSource } from './resolveVoice'
import { deviceSpeechEngine } from './speechQueue'

const SOURCE_LABEL: Record<VoiceSource, string> = {
  pinned: 'fijada en este equipo',
  profile: 'la que corresponde a este perfil',
  fallback: 'la más parecida que tiene este equipo',
  none: 'este equipo no tiene voces para este idioma',
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  left,
  right,
  format,
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  left: string
  right: string
  format: (value: number) => string
  disabled?: boolean
  onChange: (value: number) => void
}) {
  const id = useId()
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs text-neutral-400">
          {label}
        </label>
        <span className="text-xs text-neutral-200 tabular-nums">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-brasa-500 disabled:opacity-50"
      />
      <div className="flex justify-between text-[11px] text-neutral-500">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  )
}

/** ▶ Preview with exactly these settings, on this device, without creating audio files. */
export function VoicePreviewButtons({ settings, profiles }: { settings: KitchenVoiceSettings; profiles: readonly VoiceProfile[] | undefined }) {
  const voice = useEffectiveVoice(settings, profiles)
  if (!deviceSpeechEngine.available()) {
    return <p className={typography.caption}>Este navegador no puede reproducir voz.</p>
  }
  const samples = [
    kitchenPhrases.commandDone('1042', 'MARK_READY', voice.verbosity),
    voice.verbosity === 'minimal' ? '1042: hamburguesa doble y papas.' : 'Pedido 1042. Hamburguesa doble y papas listas.',
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      {samples.map((text, i) => (
        <Button key={text} variant={i === 0 ? 'primary' : 'secondary'} size="sm" icon={Play} onClick={() => previewVoice(text, voice)} title={`Escuchar: «${text}»`}>
          {i === 0 ? 'Escuchar' : 'Otra frase'}
        </Button>
      ))}
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-neutral-500">
        <Volume2 size={12} aria-hidden />
        <span className="truncate">
          En este equipo: {voice.params.voice?.name ?? 'voz predeterminada'} ({SOURCE_LABEL[voice.source]})
        </span>
      </span>
    </div>
  )
}

/**
 * Voice, style, speed, volume and language of the kitchen voice (ADR 0014).
 * Used by the platform default, the organization default and the account.
 */
export function VoiceSettingsForm({
  value,
  onChange,
  profiles,
  disabled = false,
}: {
  value: KitchenVoiceSettings
  onChange: (value: KitchenVoiceSettings) => void
  profiles: readonly VoiceProfile[] | undefined
  disabled?: boolean
}) {
  const voices = useDeviceVoices()
  const active = (profiles ?? []).filter((p) => p.active)
  const set = <K extends keyof KitchenVoiceSettings>(key: K, v: KitchenVoiceSettings[K]) => onChange({ ...value, [key]: v })

  return (
    <div className="space-y-5">
      <fieldset disabled={disabled} className="space-y-2">
        <legend className="text-xs text-neutral-400">Voz</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {active.map((p) => {
            const selected = p.key === value.profile
            return (
              <label
                key={p.key}
                className={clsx(
                  'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                  selected ? 'border-brasa-500/60 bg-brasa-500/10' : 'border-neutral-800/60 hover:border-neutral-700',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="radio"
                  name="voice-profile"
                  className="mt-1 accent-brasa-500"
                  checked={selected}
                  onChange={() => onChange({ ...value, profile: p.key, style: p.defaultStyle })}
                />
                <span className="min-w-0">
                  <span className="block font-medium text-neutral-100">
                    {p.name} <span className="font-normal text-neutral-400">— {VOICE_STYLE_META[p.defaultStyle].label}</span>
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {VOICE_GENDER_LABEL[p.gender]} · {p.description}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset disabled={disabled} className="space-y-2">
        <legend className="text-xs text-neutral-400">Estilo</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Estilo">
          {VOICE_STYLES.map((style: VoiceStyle) => (
            <button
              key={style}
              type="button"
              role="radio"
              aria-checked={value.style === style}
              onClick={() => set('style', style)}
              className={clsx(
                'rounded-full border px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                value.style === style ? 'border-brasa-500/60 bg-brasa-500/15 text-brasa-200' : 'border-neutral-800 text-neutral-300 hover:border-neutral-600',
              )}
            >
              {VOICE_STYLE_META[style].label}
            </button>
          ))}
        </div>
        <p className={typography.caption}>{VOICE_STYLE_META[value.style].description}</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <SliderField
          label="Velocidad"
          value={value.rate}
          min={VOICE_RATE.min}
          max={VOICE_RATE.max}
          step={VOICE_RATE.step}
          left="Lenta"
          right="Rápida"
          format={(v) => `${v.toFixed(2).replace('.', ',')}×`}
          disabled={disabled}
          onChange={(v) => set('rate', v)}
        />
        <SliderField
          label="Volumen"
          value={value.volume}
          min={VOICE_VOLUME.min}
          max={VOICE_VOLUME.max}
          step={VOICE_VOLUME.step}
          left="Bajo"
          right="Alto"
          format={(v) => `${Math.round(v * 100)} %`}
          disabled={disabled}
          onChange={(v) => set('volume', v)}
        />
      </div>

      <div className="max-w-sm">
        <label className="text-xs text-neutral-400" htmlFor="voice-lang">
          Idioma
        </label>
        <Select id="voice-lang" value={value.lang} disabled={disabled} onChange={(e) => set('lang', e.target.value as VoiceLang)} className="!mt-1">
          {VOICE_LANGS.map((lang) => (
            <option key={lang} value={lang}>
              {VOICE_LANG_LABEL[lang]}
              {voices.length > 0 && voicesForLang(voices, lang).length === 0 ? ' (sin voz en este equipo)' : ''}
            </option>
          ))}
        </Select>
      </div>

      <VoicePreviewButtons settings={value} profiles={profiles} />
    </div>
  )
}
