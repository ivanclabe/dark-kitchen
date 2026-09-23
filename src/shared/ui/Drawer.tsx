import clsx from 'clsx'
import { X } from 'lucide-react'
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { typography } from './typography'

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  side = 'right',
  size = 'lg',
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: ReactNode
  children: ReactNode
  side?: 'left' | 'right'
  size?: 'sm' | 'md' | 'lg'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogA11y(panelRef, open, onClose)

  if (!open) return null

  const width = { sm: 'max-w-xs', md: 'max-w-md', lg: 'max-w-2xl' }[size]

  return createPortal(
    <div className={clsx('fixed inset-0 z-50 flex', side === 'right' ? 'justify-end' : 'justify-start')}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx(
          'shadow-float relative flex h-full w-full flex-col bg-neutral-900 outline-none',
          width,
          side === 'right' ? 'animate-drawer-in border-l border-neutral-800' : 'animate-drawer-in-left border-r border-neutral-800',
        )}
      >
        <div className="flex items-start justify-between border-b border-neutral-800 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className={typography.h2}>
              {title}
            </h2>
            {subtitle && <div className={clsx('mt-0.5', typography.small)}>{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 shrink-0 rounded-full p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
