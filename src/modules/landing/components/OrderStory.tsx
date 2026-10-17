import { OrderStatusBadge } from '@/modules/orders/lib/orderStatus'
import type { OrderStatus } from '@/modules/orders/types'
import { MOOD_EXPRESSION, robotSrc, type RobotMood } from '@/shared/robot/expressions'
import { RobotFace } from '@/shared/robot/RobotFace'
import { formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { Bike, CheckCircle2, ChevronRight, MapPin, MessageCircle, PackageCheck, Play, RotateCcw, Sparkles, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * One example order, from the moment it arrives to what Quanela suggests after it (ADR 0068). Its figures
 * add up: 22.000 + 6.000 = 28.000; cost 7.400 + 2.400 = 9.800; margin (28.000 − 9.800) / 28.000 = 65 %.
 * The verbs of the button are the app's own (the board's next step).
 */
interface OrderState {
  status: OrderStatus
  clock: string
  action: { label: string; icon: LucideIcon }
  /** How the robot on the stage takes this moment (ADR 0060: a purpose, not a file). */
  robot: RobotMood
  /** Quanela's suggestion, after the delivery. */
  suggestion?: boolean
}

const STATES: OrderState[] = [
  { status: 'NUEVO', clock: 'Llegó hace 1 min', action: { label: 'Confirmar', icon: CheckCircle2 }, robot: 'celebrate' },
  { status: 'CONFIRMADO', clock: 'En cola hace 3 min', action: { label: 'Iniciar', icon: Play }, robot: 'success' },
  { status: 'EN_PREPARACION', clock: 'Preparando hace 9 min', action: { label: 'Marcar listo', icon: ChevronRight }, robot: 'info' },
  { status: 'LISTO', clock: 'Listo hace 1 min', action: { label: 'Despachar', icon: Bike }, robot: 'thanks' },
  { status: 'DESPACHADO', clock: 'En ruta hace 12 min', action: { label: 'Entregar', icon: PackageCheck }, robot: 'success' },
  { status: 'ENTREGADO', clock: 'Entregado a las 12:41', action: { label: 'Qué sigue', icon: Sparkles }, robot: 'celebrate' },
  { status: 'ENTREGADO', clock: 'Entregado a las 12:41', action: { label: 'Verlo otra vez', icon: RotateCcw }, robot: 'ai', suggestion: true },
]

/** Which step of the story each state belongs to, and the state each step shows when it is read. */
const STEP_OF_STATE = [0, 1, 1, 2, 2, 3, 4]
const STATE_OF_STEP = [0, 2, 4, 5, 6]

const ITEMS = [
  { name: 'Hamburguesa de la casa', price: 22000 },
  { name: 'Jugo de mora en agua', price: 6000 },
]
const TOTAL = 28000
const STOCK = [
  { name: 'Pan brioche', from: '12', to: '11', unit: 'und' },
  { name: 'Carne de res', from: '2,40', to: '2,25', unit: 'kg' },
  { name: 'Mora', from: '1,80', to: '1,60', unit: 'kg' },
]

export interface StoryStep {
  title: string
  body: ReactNode
}

function OrderTicket({ index, onAdvance }: { index: number; onAdvance: () => void }) {
  const state = STATES[index]
  const paid = index >= 5
  const ActionIcon = state.action.icon
  return (
    // A fragment of the app itself (its tokens, its badge, its words), in the dark theme of the operation.
    <div data-ui className="w-full max-w-[26rem] rounded-2xl bg-neutral-900 p-5 text-neutral-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold">#1004 · Mateo Castaño</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-400">
            <MessageCircle size={12} aria-hidden /> WhatsApp · {state.clock}
          </p>
        </div>
        <OrderStatusBadge status={state.status} />
      </div>

      {/* Where it is in its trip: the six states of the board. */}
      <div className="mt-4 grid grid-cols-6 gap-1" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <span key={s} className={clsx('h-1.5 rounded-full transition-colors duration-300', s <= Math.min(index, 5) ? 'bg-brasa-500' : 'bg-neutral-800')} />
        ))}
      </div>

      <ul className="mt-4 space-y-1.5 text-sm">
        {ITEMS.map((item, i) => (
          <li key={item.name} className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="tabular-nums text-neutral-400">1×</span>
              <span className="truncate">{item.name}</span>
              {index === 2 && i === 1 && <CheckCircle2 size={13} className="shrink-0 self-center text-emerald-400" aria-label="Listo" />}
            </span>
            <span className="tabular-nums text-neutral-300">{formatMoney(item.price)}</span>
          </li>
        ))}
      </ul>
      {index === 2 && <p className="mt-1.5 text-xs text-neutral-400">1 de 2 platos listos</p>}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-neutral-800 pt-3 text-sm">{/* taste-skill-ignore: the app's own total line (data-ui) */}
        <span className={clsx('rounded px-1.5 text-xs font-medium', paid ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400')}>
          {paid ? 'Pagado · Transferencia' : 'Por cobrar'}
        </span>
        <span className="font-semibold tabular-nums">{formatMoney(TOTAL)}</span>
      </div>

      {index === 3 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-neutral-400">
          <MapPin size={12} aria-hidden /> Calle 57 # 9-21, Chapinero
        </p>
      )}
      {index === 4 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-neutral-400">
          <Bike size={12} aria-hidden /> Andrés lo lleva en moto
        </p>
      )}

      {index === 5 && (
        <div className="mt-4 rounded-xl bg-neutral-950/60 p-3.5 text-xs">
          <p className="font-medium text-neutral-200">Salió del inventario</p>
          <ul className="mt-2 space-y-1 text-neutral-400">
            {STOCK.map((s) => (
              <li key={s.name} className="flex justify-between gap-3 tabular-nums">
                <span>{s.name}</span>
                <span>
                  {s.from} → <span className="text-neutral-100">{s.to}</span> {s.unit}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 flex justify-between gap-3 text-neutral-200 tabular-nums">
            <span>Costo {formatMoney(9800)}</span>
            <span>Margen 65 %</span>
          </p>
        </div>
      )}

      {state.suggestion && (
        <div className="mt-4 flex gap-3 rounded-xl bg-neutral-950/60 p-3.5">
          <RobotFace mood="ai" size={36} className="shrink-0" />
          <div className="text-xs leading-relaxed">
            <p className="font-medium text-neutral-100">Quanela sugiere</p>
            <p className="mt-1 text-neutral-300">
              Quedan 11 panes brioche. Al ritmo de esta semana alcanzan hasta el sábado: agrega 30 a tu próxima compra.
            </p>
            <p className="mt-2 text-neutral-500">Tú decides si la aceptas.</p>
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onAdvance}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 focus-visible:outline-none"
        >
          <ActionIcon size={15} aria-hidden />
          {state.action.label}
        </button>
      </div>
    </div>
  )
}

/**
 * The split stage: the order on the left never leaves the screen while the right column is read. Reading a
 * step moves the order to it; the order's own button moves it forward and brings its step into view.
 * Without script, the order rests as it arrives and every step is still there to read.
 */
export function OrderStory({ hero, steps }: { hero: ReactNode; steps: StoryStep[] }) {
  const [index, setIndex] = useState(0)
  const stepRefs = useRef<(HTMLElement | null)[]>([])
  // While the button brings a step into view, the steps the page scrolls past do not move the order.
  const driving = useRef(false)

  // The robot's faces are small; load them once the page is up so each change is instant.
  useEffect(() => {
    for (const mood of new Set(STATES.map((s) => s.robot))) new Image().src = robotSrc(MOOD_EXPRESSION[mood], 120)
  }, [])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || driving.current) continue
          const step = stepRefs.current.indexOf(entry.target as HTMLElement)
          // Reading a step shows it, unless the order is already somewhere inside that step.
          if (step >= 0) setIndex((current) => (STEP_OF_STATE[current] === step ? current : STATE_OF_STEP[step]))
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    for (const el of stepRefs.current) if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  function advance() {
    const next = (index + 1) % STATES.length
    setIndex(next)
    // Wide screens: the order stays in view, so its step comes to it. On a phone the order scrolls away with the page.
    if (STEP_OF_STATE[next] !== STEP_OF_STATE[index] && window.matchMedia?.('(min-width: 1024px)').matches) {
      const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      driving.current = true
      const release = () => {
        driving.current = false
        window.removeEventListener('scrollend', release)
      }
      window.addEventListener('scrollend', release)
      window.setTimeout(release, 1200)
      stepRefs.current[STEP_OF_STATE[next]]?.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' })
    }
  }

  const state = STATES[index]
  return (
    <div className="landing-split">
      <aside className="landing-stage" aria-label="Un pedido de ejemplo">
        <div className="landing-stage-field flex-col gap-4">
          {/* Quanela's robot lives on the stage and reacts to every step of the order. */}
          <div className="-mb-6 flex w-full max-w-[26rem] justify-end pr-4 lg:-mb-8 lg:max-w-[32.5rem]">
            <RobotFace key={state.robot + index} mood={state.robot} size={120} className="landing-robot-pop relative z-0 h-16 w-auto lg:h-[120px]" />
          </div>
          <div key={index} className="landing-order-swap relative z-10 flex w-full justify-center">
            <OrderTicket index={index} onAdvance={advance} />
          </div>
          <p className="hidden w-full max-w-[32.5rem] text-[15px] text-[#d9cbbf] lg:block">Un pedido de ejemplo. Avánzalo con su botón, o sigue leyendo.</p>
          <p className="sr-only" aria-live="polite">
            Pedido 1004: {state.suggestion ? 'Quanela sugiere una compra' : state.clock}
          </p>
        </div>
      </aside>

      <div className="min-w-0">
        {hero}
        <div id="como-funciona" className="scroll-mt-16">
          {steps.map((step, i) => (
            <section
              key={step.title}
              ref={(el) => {
                stepRefs.current[i] = el
              }}
              className="landing-step"
              aria-labelledby={`landing-step-${i}`}
            >
              <div className="max-w-[46ch]">
                <h2 id={`landing-step-${i}`} data-reveal className="landing-display text-[length:var(--l-size-title)] text-balance">
                  {step.title}
                </h2>
                <div data-reveal style={{ '--i': 1 } as CSSProperties} className="mt-5 space-y-4">
                  {step.body}
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
