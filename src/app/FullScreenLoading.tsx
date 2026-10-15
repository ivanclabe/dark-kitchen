import { RobotFace } from '@/shared/robot/RobotFace'
import type { RobotMood } from '@/shared/robot/expressions'
import { sharedCookieDomain } from '@/shared/tenant/host'
import { TIPS } from '@/shared/tips/tips'
import { Lightbulb, RefreshCw } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Which part of the way in is loading. After signing in the app goes through up to four of these screens in a
 * row (session → accounts → kitchen → the page); each says what it is doing and the bar only moves forward.
 */
export type LoadingStage = 'session' | 'account' | 'kitchen' | 'page'

const STAGES: Record<LoadingStage, { label: string; from: number; to: number }> = {
  session: { label: 'Verificando tu sesión…', from: 8, to: 35 },
  account: { label: 'Buscando tus cuentas…', from: 35, to: 60 },
  kitchen: { label: 'Abriendo tu cocina…', from: 60, to: 85 },
  page: { label: 'Preparando la pantalla…', from: 85, to: 96 },
}

/** Tapping the robot changes its face. */
const FACES: RobotMood[] = ['ai', 'info', 'success', 'celebrate']

/** A quick wait shows nothing (no flash); once shown, the screen stays at least this long, then fades out. */
const SHOW_AFTER_MS = 300
const MIN_VISIBLE_MS = 500
/** Only a wait long enough to read it gets a tip. */
const TIP_AFTER_MS = 2500
const SLOW_MS = 10_000

/**
 * The screens follow one another (and remount): what they share lives here, so the bar, the elapsed time and the
 * tip carry on instead of starting over. A new wait (nothing shown for a moment) starts fresh. `shownAt` is when
 * the screen became visible; `leaving` is the copy that fades out when the last screen goes away.
 */
const shared = { startedAt: 0, lastSeen: 0, progress: 0, tip: 0, shownAt: 0, leaving: null as HTMLElement | null }

/**
 * Signing in on quanela.com and landing on the organization's subdomain reloads the page: a short-lived cookie of
 * the parent domain (like the appearance, ADR 0023) lets the wait continue there. No cookie on localhost.
 */
const WAIT_COOKIE = 'dk-wait'

function readWaitCookie() {
  const match = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${WAIT_COOKIE}=`))
  const [startedAt, lastSeen, progress, tip] = (match?.slice(WAIT_COOKIE.length + 1) ?? '').split('.').map(Number)
  return [startedAt, lastSeen, progress, tip].every(Number.isFinite) ? { startedAt, lastSeen, progress, tip: tip % TIPS.length } : null
}

function writeWaitCookie() {
  const domain = sharedCookieDomain()
  if (!domain) return
  const value = [shared.startedAt, shared.lastSeen, Math.round(shared.progress), shared.tip].join('.')
  document.cookie = `${WAIT_COOKIE}=${value}; Domain=${domain}; Path=/; Max-Age=15; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
}

function joinWait(now: number) {
  if (now - shared.lastSeen > 1500) {
    const before = readWaitCookie()
    if (before && now - before.lastSeen < 4000) Object.assign(shared, before, { shownAt: 0 })
    else Object.assign(shared, { startedAt: now, progress: 0, tip: Math.floor(now / 1000) % TIPS.length, shownAt: 0 })
  }
  shared.lastSeen = now
}

/** Eases from the stage's start toward its end without reaching it. */
function targetFor(stage: LoadingStage, now: number): number {
  const { from, to } = STAGES[stage]
  return from + (to - from) * (1 - Math.exp(-(now - shared.startedAt) / 3500))
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** The next screen of the same wait takes over at once: the fading copy of the previous one goes away. */
function dropLeavingCopy() {
  shared.leaving?.remove()
  shared.leaving = null
}

/**
 * When the last screen of a wait goes away, a static copy of it stays on top until it has been visible for
 * MIN_VISIBLE_MS, then fades out over the app: no blink of a screen that was barely there.
 */
function leaveGently(node: HTMLElement) {
  if (!shared.shownAt) return
  const copy = node.cloneNode(true) as HTMLElement
  copy.setAttribute('aria-hidden', 'true')
  copy.removeAttribute('data-loading-screen')
  copy.setAttribute('data-loading-leaving', '')
  Object.assign(copy.style, { position: 'fixed', inset: '0', zIndex: '100', pointerEvents: 'none' })
  document.body.appendChild(copy)
  shared.leaving = copy
  const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shared.shownAt))
  const fade = prefersReducedMotion() ? 0 : 220
  window.setTimeout(() => {
    copy.style.transition = `opacity ${fade}ms ease-out`
    copy.style.opacity = '0'
    window.setTimeout(() => {
      copy.remove()
      if (shared.leaving === copy) shared.leaving = null
    }, fade + 20)
  }, remaining)
}

/**
 * The full-screen wait of the app (ADR 0060/0061): nothing for a quick wait; then the robot of Quanela, what is
 * loading and a bar that only moves forward; a one-line tip if it lasts; a way out if it takes too long.
 */
export function FullScreenLoading({ stage = 'session' }: { stage?: LoadingStage }) {
  const [now, setNow] = useState(() => {
    const t = Date.now()
    joinWait(t)
    return t
  })
  const [face, setFace] = useState(0)
  const root = useRef<HTMLDivElement>(null)

  // Keeps the bar, the elapsed time and the shared cookie up to date.
  useEffect(() => {
    let ticks = 0
    const id = window.setInterval(() => {
      const t = Date.now()
      shared.lastSeen = t
      shared.progress = Math.max(shared.progress, targetFor(stage, t))
      if (ticks++ % 4 === 0) writeWaitCookie()
      setNow(t)
    }, 120)
    return () => window.clearInterval(id)
  }, [stage])

  const elapsed = now - shared.startedAt
  const visible = elapsed >= SHOW_AFTER_MS

  useLayoutEffect(() => {
    dropLeavingCopy()
    const node = root.current
    return () => {
      if (node) leaveGently(node)
    }
  }, [])
  useEffect(() => {
    if (visible && !shared.shownAt) shared.shownAt = Date.now()
  }, [visible])

  const { label } = STAGES[stage]
  const progress = Math.round(Math.max(shared.progress, targetFor(stage, now)))
  const tip = TIPS[shared.tip]

  return (
    <div ref={root} data-loading-screen className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 py-10 text-center">
      {visible && (
        <div className="flex flex-col items-center motion-safe:animate-fade-in">
          <button
            type="button"
            onClick={() => setFace((f) => (f + 1) % FACES.length)}
            aria-label="Saludar a Quanela"
            className="rounded-3xl p-2 transition-transform hover:-translate-y-0.5 active:scale-95"
          >
            <RobotFace mood={FACES[face]} size={112} animated className="h-24 w-auto sm:h-28" />
          </button>

          <div role="status" aria-live="polite" className="mt-5">
            <p className="text-base font-semibold text-neutral-100">{label}</p>
          </div>
          <div
            className="mt-4 h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-neutral-800"
            role="progressbar"
            aria-label="Progreso de la carga"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="h-full rounded-full bg-brasa-500 transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
          </div>

          {/* A tip only when there is time to read it: one short line. */}
          <div className="mt-8 flex min-h-9 max-w-md items-center text-sm text-neutral-300">
            {elapsed >= TIP_AFTER_MS && (
              <p className="inline-flex items-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/60 px-3.5 py-2 text-left text-balance motion-safe:animate-fade-in">
                <Lightbulb size={14} className="shrink-0 text-brasa-400" aria-hidden />
                {tip.short}
              </p>
            )}
          </div>

          {elapsed > SLOW_MS && (
            <p className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-neutral-400 motion-safe:animate-fade-in">
              ¿Está tardando más de lo normal?
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 px-3 py-1 font-medium text-neutral-100 transition-colors hover:bg-neutral-800"
              >
                <RefreshCw size={13} aria-hidden /> Recargar
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
