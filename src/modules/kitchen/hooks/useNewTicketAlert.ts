import { useEffect, useRef, useState } from 'react'
import type { KitchenTicket } from '../types'

const SOUND_PREF_KEY = 'dk-kitchen-sound'

function playBeep() {
  try {
    const AudioCtxCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtxCtor) return
    const ctx = new AudioCtxCtor()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    osc.start()
    osc.stop(ctx.currentTime + 0.18)
  } catch {
    // Autoplay bloqueado por el navegador o API no disponible — es solo un
    // extra sobre la alerta visual, no debe romper la pantalla de cocina.
  }
}

/**
 * Detecta pedidos que aparecen en la cola después del primer render (no
 * alerta por lo que ya estaba en cola al abrir la pantalla) y los mantiene
 * marcados como "nuevos" hasta que se reconocen explícitamente.
 */
export function useNewTicketAlert(tickets: KitchenTicket[] | undefined) {
  const knownIds = useRef<Set<string> | null>(null)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem(SOUND_PREF_KEY) !== 'off'
    } catch {
      return true
    }
  })

  useEffect(() => {
    if (!tickets) return
    const currentIds = new Set(tickets.map((t) => t.orderId))

    if (knownIds.current === null) {
      knownIds.current = currentIds
      return
    }

    const arrived = [...currentIds].filter((id) => !knownIds.current?.has(id))
    if (arrived.length > 0) {
      setNewIds((prev) => new Set([...prev, ...arrived]))
      if (soundEnabled) playBeep()
    }
    knownIds.current = currentIds
  }, [tickets, soundEnabled])

  function acknowledge(orderId: string) {
    setNewIds((prev) => {
      if (!prev.has(orderId)) return prev
      const next = new Set(prev)
      next.delete(orderId)
      return next
    })
  }

  function toggleSound() {
    setSoundEnabled((enabled) => {
      const next = !enabled
      try {
        localStorage.setItem(SOUND_PREF_KEY, next ? 'on' : 'off')
      } catch {
        // localStorage puede no estar disponible (modo privado) — no crítico.
      }
      return next
    })
  }

  return { newIds, acknowledge, soundEnabled, toggleSound }
}
