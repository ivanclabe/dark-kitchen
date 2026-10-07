import { Select } from '@/shared/ui/FormField'
import { typography } from '@/shared/ui/typography'
import { useEffect, useState } from 'react'
import { useDeviceVoicePin, useDeviceVoices } from './hooks'
import { voicesForLang, type DeviceVoice } from './resolveVoice'
import { deviceSpeech } from './speechQueue'

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/**
 * "On this device": pin one installed voice (tablets differ) and see the real
 * latency measured here, from "message ready" to "starts speaking". ADR 0041
 * (D9): which voice speaks now, and whether it is an online one (slower to
 * start) or installed on the device.
 */
export function DeviceVoicePanel({ lang, current }: { lang: string; current?: DeviceVoice | null }) {
  const voices = useDeviceVoices()
  const [pin, setPin] = useDeviceVoicePin()
  const [latency, setLatency] = useState<{ median: number | null; count: number }>({ median: null, count: 0 })
  const spanish = voicesForLang(voices, lang)

  useEffect(() => {
    const read = () => setLatency({ median: median(deviceSpeech.latencySamples), count: deviceSpeech.latencySamples.length })
    read()
    const timer = setInterval(read, 1_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="space-y-3">
      <div className="max-w-md">
        <label htmlFor="device-voice" className="text-xs text-neutral-400">
          Voz instalada en este equipo
        </label>
        <Select id="device-voice" value={pin ?? ''} onChange={(e) => setPin(e.target.value || null)} className="!mt-1">
          <option value="">Automática (según el perfil elegido)</option>
          {spanish.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} · {v.lang}
              {v.localService === false ? ' · en línea' : ''}
            </option>
          ))}
        </Select>
        <p className={typography.caption}>
          {spanish.length === 0
            ? 'Este equipo no tiene voces en español instaladas; se usará la voz predeterminada del navegador.'
            : `Solo afecta a este equipo. ${spanish.length} ${spanish.length === 1 ? 'voz disponible' : 'voces disponibles'}.`}
        </p>
        {current && (
          <p className="mt-2 text-xs text-neutral-400">
            Habla con: <span className="text-neutral-200">{current.name}</span> · {current.localService === false ? 'en línea' : 'instalada'}
            {current.localService === false && <span className="block text-amber-300/90">Las voces instaladas en el equipo empiezan a hablar antes.</span>}
          </p>
        )}
      </div>
      <p className="text-xs text-neutral-400">
        Latencia de la voz en este equipo:{' '}
        <span className="text-neutral-200 tabular-nums">
          {latency.median === null ? 'todavía sin medir (usa «Escuchar»)' : `~${Math.round(latency.median)} ms (${latency.count} ${latency.count === 1 ? 'medición' : 'mediciones'})`}
        </span>
      </p>
    </div>
  )
}
