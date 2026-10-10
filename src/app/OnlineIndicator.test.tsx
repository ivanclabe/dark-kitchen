// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ADR 0050: a private presence channel per account; the header shows who is there.
type SubscribeCallback = (state: string) => void
interface FakeChannel {
  topic: string
  subscribed: boolean
  sync: null | (() => void)
  status: null | SubscribeCallback
}
const rt = vi.hoisted(() => ({
  kitchenId: 'k1',
  channels: [] as FakeChannel[],
  options: null as unknown,
  state: {} as Record<string, unknown[]>,
  track: vi.fn(),
  removed: 0,
}))

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    // Like Supabase: the same topic gives back the same channel, and no callbacks after subscribe().
    channel: (topic: string, options: unknown) => {
      rt.options = options
      let fake = rt.channels.find((c) => c.topic === topic)
      if (!fake) {
        fake = { topic, subscribed: false, sync: null, status: null }
        rt.channels.push(fake)
      }
      const f = fake
      const channel = {
        on: (_type: string, _filter: unknown, cb: () => void) => {
          if (f.subscribed) throw new Error(`cannot add \`presence\` callbacks for realtime:${topic} after \`subscribe()\`.`)
          f.sync = cb
          return channel
        },
        subscribe: (cb: SubscribeCallback) => {
          f.subscribed = true
          f.status = cb
          return channel
        },
        presenceState: () => rt.state,
        track: rt.track,
        topic,
      }
      return channel
    },
    removeChannel: (channel: { topic: string }) => {
      rt.removed += 1
      rt.channels = rt.channels.filter((c) => c.topic !== channel.topic)
      return Promise.resolve('ok')
    },
  },
}))
vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: () => ({ profile: { id: 'me', fullName: 'Laura Gómez', avatarKey: null } }) }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({ useActiveKitchen: () => ({ kitchen: { id: rt.kitchenId, roleName: 'Administrador' } }) }))

const { OnlineIndicator } = await import('./OnlineIndicator')

const person = (userId: string, name: string, status = 'active', roleName = 'Cocina') => ({ userId, name, avatarKey: null, roleName, status, onlineAt: '2026-10-10T10:00:00Z' })
const channel = () => rt.channels.find((c) => c.topic === `account:${rt.kitchenId}:presence`)!

let n = 0
beforeEach(() => {
  // A fresh account per test: the shared session of the previous one may still be closing.
  n += 1
  rt.kitchenId = `k${n}`
  rt.state = {}
  rt.track.mockReset()
  rt.removed = 0
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('En línea (ADR 0050)', () => {
  it('joins the private channel of the active account and announces itself (name, role, active)', () => {
    render(<OnlineIndicator />)
    expect(channel().topic).toBe(`account:${rt.kitchenId}:presence`)
    expect(rt.options).toMatchObject({ config: { private: true, presence: { key: 'me' } } })
    expect(screen.getByRole('button', { name: 'Sin conexión en vivo' })).toBeTruthy()
    act(() => channel().status!('SUBSCRIBED'))
    expect(rt.track).toHaveBeenCalledWith(expect.objectContaining({ userId: 'me', name: 'Laura Gómez', roleName: 'Administrador', status: 'active' }))
    // Never the screen or what the person does.
    expect(Object.keys(rt.track.mock.calls.at(-1)![0]).sort()).toEqual(['avatarKey', 'name', 'onlineAt', 'roleName', 'status', 'userId'])
  })

  it('two indicators (desktop and phone header) and a StrictMode remount share one channel', () => {
    render(
      <StrictMode>
        <OnlineIndicator />
        <OnlineIndicator compact />
      </StrictMode>,
    )
    expect(rt.channels.filter((c) => c.topic === `account:${rt.kitchenId}:presence`)).toHaveLength(1)
    act(() => channel().status!('SUBSCRIBED'))
    rt.state = { me: [person('me', 'Laura Gómez')], u2: [person('u2', 'Andrés')] }
    act(() => channel().sync!())
    // Both show the same, from the same channel.
    expect(screen.getAllByRole('button', { name: /2 en línea/ })).toHaveLength(2)
    expect(screen.getByText('2 en línea')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('counts people and lists them, me first and the away ones marked', () => {
    render(<OnlineIndicator />)
    act(() => channel().status!('SUBSCRIBED'))
    expect(screen.getByRole('button', { name: /Solo tú/ })).toBeTruthy()
    rt.state = {
      me: [person('me', 'Laura Gómez', 'active', 'Administrador'), person('me', 'Laura Gómez', 'away', 'Administrador')],
      u2: [person('u2', 'Andrés', 'away')],
      u3: [person('u3', 'Beatriz', 'active', 'Caja')],
    }
    act(() => channel().sync!())
    fireEvent.click(screen.getByRole('button', { name: /3 en línea/ }))
    expect(screen.getByText('3 personas con esta cuenta abierta')).toBeTruthy()
    const names = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(names).toEqual(['Laura Gómez (tú)Administrador', 'BeatrizCaja', 'AndrésCocina · ausente'])
  })

  it('a lost connection says so; the channel closes a moment after the last indicator leaves', () => {
    vi.useFakeTimers()
    const { unmount } = render(<OnlineIndicator compact />)
    act(() => channel().status!('SUBSCRIBED'))
    act(() => channel().status!('CHANNEL_ERROR'))
    expect(screen.getByRole('button', { name: 'Sin conexión en vivo' })).toBeTruthy()
    unmount()
    expect(rt.removed).toBe(0)
    act(() => vi.advanceTimersByTime(2000))
    expect(rt.removed).toBe(1)
  })
})
