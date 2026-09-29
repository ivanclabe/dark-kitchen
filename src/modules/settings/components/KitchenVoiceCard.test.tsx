// @vitest-environment jsdom
import type { FeatureKey, FeatureState } from '@/shared/features/features'
import { ToastProvider } from '@/shared/ui/Toast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ADR 0014: the account sees only what the organization allows; the preview uses the exact settings.
const { ctx, profileRows } = vi.hoisted(() => ({
  ctx: { features: new Map<string, unknown>() },
  profileRows: [
    { key: 'laura', name: 'Laura', gender: 'female', default_style: 'natural', pitch: 1, lang: 'es-CO', provider: 'device', device_voice_hints: ['Paulina'], description: 'Natural.', active: true, sort_order: 20 },
    { key: 'daniel', name: 'Daniel', gender: 'male', default_style: 'professional', pitch: 0.95, lang: 'es-CO', provider: 'device', device_voice_hints: ['Jorge'], description: 'Profesional.', active: true, sort_order: 30 },
  ],
}))

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ order: async () => ({ data: profileRows, error: null }) }) }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  },
}))
vi.mock('@/shared/kitchen/activeKitchenContext', async (original) => ({
  ...(await original<typeof import('@/shared/kitchen/activeKitchenContext')>()),
  useActiveKitchen: () => ({
    kitchen: { id: 'k1' },
    feature: (key: FeatureKey) => ctx.features.get(key) ?? null,
    canUseFeature: (key: FeatureKey) => (ctx.features.get(key) as FeatureState | undefined)?.usable === true,
    can: () => true,
    organizationRole: 'MIEMBRO',
  }),
}))

import { AI_FEATURES } from '@/modules/ai/lib/catalog'
import { FeatureCard } from '@/modules/ai/components/FeatureCard'
import { KitchenVoiceCard } from './KitchenVoiceCard'

const state = (over: Partial<FeatureState>): FeatureState => ({
  key: 'voice_speech',
  category: 'voice',
  label: 'Voz de la aplicación',
  description: '',
  usesModel: false,
  platformActive: true,
  includedInPlan: true,
  available: true,
  enabled: true,
  usable: true,
  canManage: false,
  canConfigure: true,
  accountOverride: true,
  settings: { profile: 'laura', style: 'natural', rate: 1, volume: 1, lang: 'es-CO' },
  inheritedSettings: { profile: 'laura', style: 'natural', rate: 1, volume: 1, lang: 'es-CO' },
  dependsOn: [],
  updatedAt: null,
  ...over,
})

interface FakeUtterance {
  text: string
  lang: string
  rate: number
  pitch: number
  volume: number
  voice: { name: string } | null
  onstart?: () => void
  onend?: () => void
}
const spoken: FakeUtterance[] = []
const VOICES = [
  { name: 'Paulina', lang: 'es-MX', voiceURI: 'paulina', default: true },
  { name: 'Jorge', lang: 'es-MX', voiceURI: 'jorge', default: false },
]

beforeEach(() => {
  spoken.length = 0
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string
      constructor(text: string) {
        this.text = text
      }
    },
  )
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      speak: (u: FakeUtterance) => {
        spoken.push(u)
        u.onstart?.()
        u.onend?.()
      },
      cancel: vi.fn(),
      getVoices: () => VOICES,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  })
})
afterEach(() => {
  cleanup()
  ctx.features.clear()
  vi.unstubAllGlobals()
})

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>,
  )
}

describe('Voz de cocina en la cuenta', () => {
  it('permitida: elige voz y la vista previa usa exactamente esa configuración', async () => {
    ctx.features.set('voice_speech', state({}))
    wrap(<KitchenVoiceCard />)
    await screen.findByText('Daniel')
    fireEvent.click(screen.getByRole('button', { name: 'Escuchar' }))
    expect(spoken.at(-1)).toMatchObject({ text: 'Pedido 1042 listo.', lang: 'es-CO', rate: 1, pitch: 1, volume: 1 })
    expect(spoken.at(-1)?.voice?.name).toBe('Paulina')

    fireEvent.click(screen.getByRole('radio', { name: /Daniel/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Escuchar' }))
    expect(spoken.at(-1)?.voice?.name).toBe('Jorge')
    expect(spoken.at(-1)?.pitch).toBeCloseTo(0.95)
    expect(screen.getByRole('button', { name: 'Guardar voz' })).toBeTruthy()
  })

  it('la organización no permite personalizar: solo lectura, sin opciones', async () => {
    ctx.features.set('voice_speech', state({ canConfigure: false, accountOverride: false }))
    wrap(<KitchenVoiceCard />)
    await screen.findByText(/Tu organización define la voz de todas sus cuentas/)
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Escuchar' })).toBeTruthy()
  })

  it('apagada por la plataforma: no disponible y nada que activar', () => {
    ctx.features.set('voice_speech', state({ platformActive: false, usable: false, enabled: false }))
    wrap(<KitchenVoiceCard />)
    expect(screen.getByText('La voz de cocina no está disponible para esta cuenta.')).toBeTruthy()
    expect(screen.getByText(/La plataforma tiene apagada esta función/)).toBeTruthy()
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
  })
})

describe('IA en la cuenta', () => {
  it('sin interruptor de activación: estado y umbrales', () => {
    const definition = AI_FEATURES.find((f) => f.key === 'kitchen_stall_alerts')!
    ctx.features.set(
      'kitchen_stall_alerts',
      state({ key: 'kitchen_stall_alerts', category: 'ai', label: definition.title, settings: { dish_stall_min: 12, repeat_min: 5, voice: true }, inheritedSettings: { dish_stall_min: 12, repeat_min: 5, voice: true } }),
    )
    wrap(<FeatureCard definition={definition} />)
    expect(screen.queryByRole('switch', { name: /^Activar/ })).toBeNull()
    expect(screen.getByText('Activa')).toBeTruthy()
    expect((screen.getByLabelText('Plato sin avanzar más de') as HTMLInputElement).disabled).toBe(false)
  })

  it('apagada en la cuenta: explica quién la activa', () => {
    const definition = AI_FEATURES.find((f) => f.key === 'kitchen_stall_alerts')!
    ctx.features.set('kitchen_stall_alerts', state({ key: 'kitchen_stall_alerts', category: 'ai', enabled: false, usable: false }))
    wrap(<FeatureCard definition={definition} />)
    expect(screen.getByText(/La activa el SUPER_ADMIN de la organización/)).toBeTruthy()
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
  })
})
