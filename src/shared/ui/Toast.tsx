import { RobotFace } from '@/shared/robot/RobotFace'
import type { RobotMood } from '@/shared/robot/expressions'
import { X } from 'lucide-react'
import { createContext, use, useCallback, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ToastTone = 'success' | 'error' | 'warning' | 'info'

interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastItem {
  id: number
  tone: ToastTone
  message: string
  action?: ToastAction
  mood?: RobotMood
}

export interface ToastOptions {
  /** One button next to the message (e.g. "Deshacer"); clicking it also closes the toast. */
  action?: ToastAction
  durationMs?: number
  /** Another robot than the tone's, e.g. `celebrate` when the menu goes live (ADR 0060). */
  mood?: RobotMood
}

interface ToastContextValue {
  show: (message: string, tone?: ToastTone, options?: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/**
 * Each tone with its frame and its robot (ADR 0060: the robot replaces the generic icon). The surface follows
 * the theme (neutral-900 is white in the light one) and the tone colors the border, so the text always reads.
 */
const TONE_STYLES: Record<ToastTone, { border: string; mood: RobotMood }> = {
  success: { border: 'border-emerald-500/50 bg-neutral-900/95', mood: 'success' },
  error: { border: 'border-red-500/50 bg-neutral-900/95', mood: 'error' },
  warning: { border: 'border-amber-500/50 bg-neutral-900/95', mood: 'warning' },
  info: { border: 'border-neutral-700 bg-neutral-900/95', mood: 'info' },
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  // Each toast's timer and how much time it had left: hovering or focusing the toasts pauses them (ADR 0065).
  const timers = useRef(new Map<number, { timeout: ReturnType<typeof setTimeout> | null; remaining: number; startedAt: number }>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer?.timeout) clearTimeout(timer.timeout)
    timers.current.delete(id)
    setToasts((t) => t.filter((toast) => toast.id !== id))
  }, [])

  const start = useCallback(
    (id: number, ms: number) => {
      timers.current.set(id, { timeout: setTimeout(() => dismiss(id), ms), remaining: ms, startedAt: Date.now() })
    },
    [dismiss],
  )

  const show = useCallback(
    (message: string, tone: ToastTone = 'success', options?: ToastOptions) => {
      const id = nextId++
      setToasts((t) => [...t, { id, tone, message, action: options?.action, mood: options?.mood }])
      start(id, options?.durationMs ?? (options?.action ? 6000 : 4000))
    },
    [start],
  )

  function pause() {
    for (const [id, timer] of timers.current) {
      if (!timer.timeout) continue
      clearTimeout(timer.timeout)
      timers.current.set(id, { ...timer, timeout: null, remaining: Math.max(1000, timer.remaining - (Date.now() - timer.startedAt)) })
    }
  }

  function resume() {
    for (const [id, timer] of timers.current) if (!timer.timeout) start(id, timer.remaining)
  }

  return (
    <ToastContext value={{ show }}>
      {children}
      {createPortal(
        // Phone: full width with margins and above the home bar (iOS); from sm: the 20 rem corner card.
        // A live region that is always there (a status added with its own role is announced unreliably).
        <div
          aria-live="polite"
          onMouseEnter={pause}
          onMouseLeave={resume}
          onFocus={pause}
          onBlur={resume}
          className="fixed inset-x-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[60] flex flex-col gap-2 sm:inset-x-auto sm:right-5 sm:w-80"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role={toast.tone === 'error' || toast.tone === 'warning' ? 'alert' : undefined}
              className={`shadow-float flex items-center gap-2.5 rounded-lg border py-2.5 pr-3.5 pl-2.5 text-sm text-neutral-100 backdrop-blur ${TONE_STYLES[toast.tone].border}`}
            >
              <RobotFace mood={toast.mood ?? TONE_STYLES[toast.tone].mood} size={30} />
              <p className="min-w-0 flex-1 break-words">{toast.message}</p>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick()
                    dismiss(toast.id)
                  }}
                  className="shrink-0 rounded-md px-1.5 text-sm font-semibold text-brasa-300 transition-colors hover:bg-white/5 hover:text-brasa-200"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(toast.id)}
                className="text-neutral-500 transition-colors hover:text-neutral-200"
                aria-label="Cerrar notificación"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext>
  )
}

export function useToast(): ToastContextValue {
  const ctx = use(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
