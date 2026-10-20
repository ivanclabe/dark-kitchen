import { ConfirmDialog } from '@/shared/ui/Modal'
import { acceptOnlineRecognition, ONLINE_RECOGNITION_NOTICE } from './preference'

/**
 * ADR 0071: the online recognizer is opt-in. Nothing is saved until the
 * person accepts this notice; cancelling keeps the local engine.
 */
export function OnlineRecognitionNotice({ open, onCancel, onAccepted }: { open: boolean; onCancel: () => void; onAccepted: () => void }) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onCancel}
      onConfirm={() => {
        acceptOnlineRecognition()
        onAccepted()
      }}
      title="¿Usar el reconocimiento en línea?"
      description={<p>{ONLINE_RECOGNITION_NOTICE}</p>}
      confirmLabel="Aceptar y usar en línea"
      mood={null}
    />
  )
}
