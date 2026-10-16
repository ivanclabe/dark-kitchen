import { useId, useRef, type ReactNode } from 'react'
import { RobotFace } from '@/shared/robot/RobotFace'
import type { RobotMood } from '@/shared/robot/expressions'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { Button } from './Button'
import { typography } from './typography'

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogA11y(panelRef, open, onClose)

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="shadow-float animate-fade-in relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-2xl border border-neutral-800 bg-neutral-900 outline-none sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <h2 id={titleId} className={typography.h2}>
              {title}
            </h2>
            {description && <p className={`mt-0.5 ${typography.small}`}>{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1.5 -mt-1 shrink-0 rounded-full p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 py-2 text-sm text-neutral-300">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 pt-3 pb-5">{footer}</div>}
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
  mood,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: ReactNode
  confirmLabel?: string
  danger?: boolean
  pending?: boolean
  /**
   * ADR 0060: the robot next to the description. By default the warning one on destructive actions and none
   * on the rest (`null` turns it off). The buttons and their safety do not change.
   */
  mood?: RobotMood | null
}) {
  const face = mood === undefined ? (danger ? 'warning' : null) : mood
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={pending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {face ? (
        <div className="flex items-start gap-3.5">
          <RobotFace mood={face} size={48} className="mt-0.5" />
          <div className="min-w-0 flex-1">{description}</div>
        </div>
      ) : (
        description
      )}
    </Modal>
  )
}
