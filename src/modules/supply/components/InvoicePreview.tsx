import { LoadingState } from '@/shared/ui/LoadingState'
import clsx from 'clsx'
import { ExternalLink, ZoomIn, ZoomOut } from 'lucide-react'
import { useState } from 'react'
import { useInvoiceFileUrl } from '../hooks/useInvoiceImport'

/** The invoice next to what was read (ADR 0049): a photo with zoom, or the PDF. */
export function InvoicePreview({ filePath, mimeType, fileName }: { filePath: string; mimeType: string; fileName: string }) {
  const { data: url, isLoading, isError } = useInvoiceFileUrl(filePath)
  const [zoom, setZoom] = useState(false)
  const pdf = mimeType === 'application/pdf'

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-neutral-800/60 bg-neutral-950">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-800/60 px-3 py-2">
        <p className="min-w-0 truncate text-xs text-neutral-400">{fileName}</p>
        <div className="flex shrink-0 items-center gap-1">
          {!pdf && url && (
            <button
              type="button"
              onClick={() => setZoom((z) => !z)}
              className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              aria-label={zoom ? 'Ver completa' : 'Acercar'}
              title={zoom ? 'Ver completa' : 'Acercar'}
            >
              {zoom ? <ZoomOut size={15} aria-hidden /> : <ZoomIn size={15} aria-hidden />}
            </button>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              aria-label="Abrir en otra pestaña"
              title="Abrir en otra pestaña"
            >
              <ExternalLink size={15} aria-hidden />
            </a>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <LoadingState variant="block" label="Abriendo la factura…" />
        ) : isError || !url ? (
          <p className="p-4 text-sm text-neutral-500">No pudimos mostrar la factura.</p>
        ) : pdf ? (
          <iframe src={url} title={`Factura ${fileName}`} className="h-full min-h-[28rem] w-full bg-white" />
        ) : (
          <button type="button" onClick={() => setZoom((z) => !z)} className={clsx('block w-full', zoom ? 'cursor-zoom-out' : 'cursor-zoom-in')}>
            <img src={url} alt={`Factura ${fileName}`} className={clsx('mx-auto', zoom ? 'max-w-none w-[200%]' : 'w-full')} />
          </button>
        )}
      </div>
    </div>
  )
}
