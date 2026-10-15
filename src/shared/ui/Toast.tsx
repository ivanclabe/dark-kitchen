import { RobotFace } from '@/shared/robot/RobotFace'
import type { RobotMood } from '@/shared/robot/expressions'
import { X } from 'lucide-react'
import { createContext, use, useCallback, useState, type ReactNode } from 'react'
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

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (message: string, tone: ToastTone = 'success', options?: ToastOptions) => {
      const id = nextId++
      setToasts((t) => [...t, { id, tone, message, action: options?.action, mood: options?.mood }])
      setTimeout(() => dismiss(id), options?.durationMs ?? (options?.action ? 6000 : 4000))
    },
    [dismiss],
  )

  return (
    <ToastContext value={{ show }}>
      {children}
      {createPortal(
        <div className="fixed bottom-5 right-5 z-[60] flex w-80 flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role={toast.tone === 'error' || toast.tone === 'warning' ? 'alert' : 'status'}
              className={`shadow-float flex items-center gap-2.5 rounded-lg border py-2.5 pr-3.5 pl-2.5 text-sm text-neutral-100 backdrop-blur ${TONE_STYLES[toast.tone].border}`}
            >
              <RobotFace mood={toast.mood ?? TONE_STYLES[toast.tone].mood} size={30} />
              <p className="flex-1">{toast.message}</p>
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
