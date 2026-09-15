import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { dangerButtonClass, primaryButtonClass, secondaryButtonClass } from './formClasses'

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogA11y(panelRef, open, onClose)

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="shadow-float relative flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-neutral-800 bg-neutral-900 outline-none"
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <h2 id={titleId} className="font-medium text-neutral-100">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-sm text-neutral-300">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-neutral-800 px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  danger = false,
  pending = false,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: ReactNode
  confirmLabel?: string
  danger?: boolean
  pending?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button onClick={onClose} className={secondaryButtonClass}>
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={pending} className={danger ? dangerButtonClass : primaryButtonClass}>
            {pending ? 'Procesando…' : confirmLabel}
          </button>
        </>
      }
    >
      {description}
    </Modal>
  )
}
