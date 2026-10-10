import { Button } from '@/shared/ui/Button'
import clsx from 'clsx'
import { Camera, FileUp } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { INVOICE_ACCEPT, invoiceFileProblem } from '../lib/invoiceFile'

/**
 * Where the invoice comes in (ADR 0049): drop it, choose it, or take the
 * photo with the phone camera. One file at a time.
 */
export function InvoiceDropzone({ onFile, disabled }: { onFile: (file: File) => void; disabled?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  function take(file: File | undefined) {
    if (!file) return
    const why = invoiceFileProblem(file)
    setProblem(why)
    if (!why) onFile(file)
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (!disabled) take(e.dataTransfer.files[0])
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={clsx(
          'flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
          dragging ? 'border-brasa-500 bg-brasa-500/5' : 'border-neutral-800 bg-neutral-900/40',
          disabled && 'opacity-60',
        )}
      >
        <span className="flex size-12 items-center justify-center rounded-2xl border border-brasa-500/20 bg-brasa-500/10 text-brasa-400">
          <FileUp size={22} aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="text-base font-medium text-neutral-100">Suelta aquí la factura</p>
          <p className="text-sm text-neutral-400">Una foto (JPG, PNG o WebP) o un PDF de hasta 10 MB.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" icon={FileUp} onClick={() => fileRef.current?.click()} disabled={disabled}>
            Elegir archivo
          </Button>
          {/* On a phone this opens the camera. */}
          <Button variant="secondary" icon={Camera} onClick={() => cameraRef.current?.click()} disabled={disabled} className="sm:hidden">
            Tomar foto
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={INVOICE_ACCEPT}
          className="sr-only"
          aria-label="Elegir la factura"
          onChange={(e) => {
            take(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label="Tomar foto de la factura"
          tabIndex={-1}
          onChange={(e) => {
            take(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {problem && (
        <p role="alert" className="text-sm text-red-400">
          {problem}
        </p>
      )}
    </div>
  )
}
