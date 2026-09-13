import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { createContext, use, useCallback, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

interface ToastContextValue {
  show: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TONE_STYLES: Record<ToastTone, { border: string; icon: ReactNode }> = {
  success: { border: 'border-emerald-800 bg-emerald-950/90', icon: <CheckCircle2 size={18} className="text-emerald-400" /> },
  error: { border: 'border-red-800 bg-red-950/90', icon: <AlertCircle size={18} className="text-red-400" /> },
  info: { border: 'border-neutral-700 bg-neutral-900/95', icon: <Info size={18} className="text-neutral-300" /> },
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextId++
      setToasts((t) => [...t, { id, tone, message }])
      setTimeout(() => dismiss(id), 4000)
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
              className={`shadow-float flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm text-neutral-100 backdrop-blur ${TONE_STYLES[toast.tone].border}`}
            >
              {TONE_STYLES[toast.tone].icon}
              <p className="flex-1">{toast.message}</p>
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
