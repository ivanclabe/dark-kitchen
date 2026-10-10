import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { KitchenLink } from '@/shared/kitchen/KitchenLink'
import { Button, buttonClass } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Page } from '@/shared/ui/Page'
import { PageHeader } from '@/shared/ui/PageHeader'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Copy, FileSearch, Loader2, RefreshCw, ScanText } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { InvoiceImportError, matchInvoice, reopenInvoiceImport, rereadInvoice, uploadAndReadInvoice } from '../api/invoiceImport'
import { InvoiceDropzone } from '../components/InvoiceDropzone'
import { InvoiceReview } from '../components/InvoiceReview'
import { useInvoiceImport } from '../hooks/useInvoiceImport'
import { takePendingInvoiceFile } from '../lib/invoiceFile'
import type { InvoiceMatch, ReadResult } from '../types/invoiceImport'

type Stage = { kind: 'idle' } | { kind: 'reading'; step: 'upload' | 'read' } | { kind: 'duplicate'; result: Extract<ReadResult, { kind: 'duplicate' }>; file: File } | { kind: 'error'; message: string; file?: File }

/** What was matched right after reading, kept so the review opens without asking again. */
const MATCH_KEY = (importId: string) => ['invoice-imports', importId, 'match'] as const

/**
 * Importar compra desde factura (ADR 0049): /supply/compras/importar to read
 * a new one, /supply/compras/importar/:importId to review one already read.
 */
export function InvoiceImportPage() {
  const { importId } = useParams<{ importId?: string }>()
  const navigate = useNavigate()
  const { path, can, feature } = useActiveKitchen()
  const queryClient = useQueryClient()
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const allowed = can('purchasing.create') && can('invoices.upload')
  const usable = feature('invoice_import')?.usable ?? false

  async function read(file: File, force = false) {
    setStage({ kind: 'reading', step: 'upload' })
    const timer = window.setTimeout(() => setStage({ kind: 'reading', step: 'read' }), 1500)
    try {
      const result = await uploadAndReadInvoice(file, { force })
      if (result.kind === 'duplicate') {
        setStage({ kind: 'duplicate', result, file })
        return
      }
      queryClient.setQueryData(MATCH_KEY(result.importId), result.match)
      void queryClient.invalidateQueries({ queryKey: ['invoice-imports'] })
      setStage({ kind: 'idle' })
      navigate(path(`/supply/compras/importar/${result.importId}`), { replace: true })
    } catch (err) {
      if (err instanceof InvoiceImportError && err.importId) {
        void queryClient.invalidateQueries({ queryKey: ['invoice-imports'] })
        setStage({ kind: 'idle' })
        navigate(path(`/supply/compras/importar/${err.importId}`), { replace: true })
        return
      }
      setStage({ kind: 'error', message: err instanceof Error ? err.message : 'No pudimos leer la factura.', file })
    } finally {
      window.clearTimeout(timer)
    }
  }

  // A file dropped on the purchases list starts right away (once).
  const started = useRef(false)
  useEffect(() => {
    if (started.current || importId) return
    started.current = true
    const pending = takePendingInvoiceFile()
    if (pending) void read(pending)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importId])

  return (
    <Page>
      <PageHeader
        help="invoice-import"
        title="Importar compra desde factura"
        description="Quanela lee la factura con IA; tú revisas todo antes de guardar."
        icon={ScanText}
        backTo="/supply/compras"
        backLabel="Volver a Compras"
      />
      {!allowed ? (
        <EmptyState icon={ScanText} title="No tienes permiso" description="Para importar facturas necesitas poder crear compras y subir facturas." />
      ) : importId ? (
        <ImportReview importId={importId} />
      ) : !usable ? (
        <EmptyState
          icon={ScanText}
          title="La lectura de facturas no está disponible"
          description="Tu plan o tu cuenta no tienen activa «Importar compras desde facturas». Puedes crear la compra a mano."
          action={
            <KitchenLink to="/supply/compras" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
              Ir a Compras
            </KitchenLink>
          }
        />
      ) : stage.kind === 'reading' ? (
        <ReadingState step={stage.step} />
      ) : stage.kind === 'duplicate' ? (
        <DuplicateState
          result={stage.result}
          onReadAgain={() => void read(stage.file, true)}
          onOther={() => setStage({ kind: 'idle' })}
        />
      ) : (
        <div className="max-w-2xl space-y-4">
          {stage.kind === 'error' && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200">
              <span className="flex items-center gap-2">
                <AlertTriangle size={15} aria-hidden /> {stage.message}
              </span>
              {stage.file && (
                <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => void read(stage.file!)}>
                  Intentar de nuevo
                </Button>
              )}
            </div>
          )}
          <InvoiceDropzone onFile={(file) => void read(file)} />
          <ul className="space-y-1.5 text-sm text-neutral-400">
            <li>• Quanela lee el proveedor, el NIT, el número, la fecha, las líneas y los totales, y busca tus proveedores e insumos.</li>
            <li>• Tú revisas y corriges todo. La compra queda en borrador, o confirmada si lo eliges; el inventario solo se mueve al confirmar.</li>
            <li>• La factura se envía al proveedor de IA de Quanela para leerla y queda guardada, privada, como adjunto de la compra.</li>
          </ul>
        </div>
      )}
    </Page>
  )
}

function ReadingState({ step }: { step: 'upload' | 'read' }) {
  const steps = [
    { key: 'upload', label: 'Subiendo la factura' },
    { key: 'read', label: 'Leyendo con IA (10 a 40 segundos)' },
    { key: 'match', label: 'Buscando tus proveedores e insumos' },
  ]
  const current = step === 'upload' ? 0 : 1
  return (
    <div className="max-w-md space-y-3 rounded-2xl border border-neutral-800/60 bg-neutral-900/40 p-5" role="status" aria-live="polite">
      {steps.map((s, i) => (
        <p key={s.key} className={i <= current ? 'flex items-center gap-2 text-sm text-neutral-100' : 'flex items-center gap-2 text-sm text-neutral-500'}>
          {i < current ? <CheckCircle2 size={16} className="text-emerald-400" aria-hidden /> : i === current ? <Loader2 size={16} className="animate-spin text-brasa-400" aria-hidden /> : <span className="size-4" />}
          {s.label}
        </p>
      ))}
      <p className="text-xs text-neutral-500">Puedes salir: la factura queda en Compras → Por revisar.</p>
    </div>
  )
}

function DuplicateState({ result, onReadAgain, onOther }: { result: Extract<ReadResult, { kind: 'duplicate' }>; onReadAgain: () => void; onOther: () => void }) {
  return (
    <div className="max-w-xl space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
      <p className="flex items-center gap-2 font-medium text-amber-200">
        <Copy size={16} aria-hidden /> Ya importaste este archivo
      </p>
      <p className="text-sm text-neutral-300">
        {result.purchaseId
          ? `Se registró como la compra de la factura ${result.invoiceNumber ?? ''}.`
          : 'Está en Compras → Por revisar.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {result.purchaseId ? (
          <KitchenLink to={`/supply/compras/${result.purchaseId}`} className={buttonClass({ variant: 'primary', size: 'sm' })}>
            Ver la compra
          </KitchenLink>
        ) : (
          <KitchenLink to={`/supply/compras/importar/${result.importId}`} className={buttonClass({ variant: 'primary', size: 'sm' })}>
            Revisarla
          </KitchenLink>
        )}
        <Button variant="secondary" size="sm" onClick={onOther}>
          Subir otra
        </Button>
        <Button variant="ghost" size="sm" onClick={onReadAgain}>
          Leerla de nuevo
        </Button>
      </div>
    </div>
  )
}

/** An import already read: the review, or what happened to it. */
function ImportReview({ importId }: { importId: string }) {
  const navigate = useNavigate()
  const { path } = useActiveKitchen()
  const queryClient = useQueryClient()
  const { data: invoice, isLoading, isError, error, refetch } = useInvoiceImport(importId)
  const [match, setMatch] = useState<InvoiceMatch | null>(() => queryClient.getQueryData<InvoiceMatch>(MATCH_KEY(importId)) ?? null)
  const [rereading, setRereading] = useState(false)
  // When the screen opened: a read still «in progress» 3 minutes later was interrupted.
  const [openedAt] = useState(() => Date.now())
  const [rereadError, setRereadError] = useState<string | null>(null)

  // Opened later (from «Por revisar»): ask the database for the matches again.
  useEffect(() => {
    if (match || !invoice?.extraction || invoice.status !== 'LISTA') return
    let cancelled = false
    matchInvoice(invoice.extraction, null)
      .then((m) => !cancelled && setMatch(m))
      .catch(() => !cancelled && setMatch({ suppliers: [], supplierId: null, supplierStrong: false, duplicateInvoice: null, lines: [] }))
    return () => {
      cancelled = true
    }
  }, [invoice, match])

  async function reviewWhatWasRead() {
    if (!invoice?.extraction) return
    setRereading(true)
    setRereadError(null)
    try {
      await reopenInvoiceImport(importId, invoice.extraction)
      setMatch(null)
      await refetch()
    } catch (err) {
      setRereadError(err instanceof Error ? err.message : 'No pudimos abrir lo leído.')
    } finally {
      setRereading(false)
    }
  }

  async function reread() {
    setRereading(true)
    setRereadError(null)
    try {
      const result = await rereadInvoice(importId)
      if (result.kind === 'read') {
        queryClient.setQueryData(MATCH_KEY(importId), result.match)
        setMatch(result.match)
      }
      await refetch()
    } catch (err) {
      setRereadError(err instanceof Error ? err.message : 'No pudimos leer la factura.')
      await refetch()
    } finally {
      setRereading(false)
    }
  }

  if (isLoading) return <LoadingState variant="block" label="Abriendo la factura…" />
  if (isError || !invoice) return <ErrorState error={error} onRetry={() => void refetch()} />

  if (invoice.status === 'USADA') {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Esta factura ya se guardó"
        description="Ya es una compra."
        action={
          invoice.purchaseId && (
            <KitchenLink to={`/supply/compras/${invoice.purchaseId}`} className={buttonClass({ variant: 'primary', size: 'sm' })}>
              Ver la compra
            </KitchenLink>
          )
        }
      />
    )
  }
  if (invoice.status === 'DESCARTADA') {
    return <EmptyState icon={FileSearch} title="Esta factura se descartó" description="Súbela de nuevo si la necesitas." />
  }
  if (invoice.status === 'LEYENDO' || invoice.status === 'ERROR' || rereading) {
    const stale = invoice.status === 'LEYENDO' && openedAt - new Date(invoice.createdAt).getTime() > 3 * 60_000
    return (
      <div className="max-w-xl space-y-3 rounded-2xl border border-neutral-800/60 bg-neutral-900/40 p-5">
        {rereading || (invoice.status === 'LEYENDO' && !stale) ? (
          <LoadingState variant="inline" label="Leyendo la factura…" />
        ) : (
          <>
            <p className="flex items-center gap-2 font-medium text-neutral-100">
              <AlertTriangle size={16} className="text-amber-400" aria-hidden /> No pudimos leer esta factura
            </p>
            <p className="text-sm text-neutral-400">{rereadError ?? invoice.error ?? 'La lectura se interrumpió.'}</p>
            {(invoice.extraction?.lines.length ?? 0) > 0 && (
              <p className="text-sm text-neutral-300">Quanela alcanzó a leer {invoice.extraction!.lines.length} producto(s): puedes revisarlos y completar lo que falte.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {(invoice.extraction?.lines.length ?? 0) > 0 && (
                <Button variant="primary" size="sm" icon={FileSearch} onClick={() => void reviewWhatWasRead()}>
                  Revisar lo que se leyó
                </Button>
              )}
              <Button variant={(invoice.extraction?.lines.length ?? 0) > 0 ? 'secondary' : 'primary'} size="sm" icon={RefreshCw} onClick={() => void reread()}>
                Leer de nuevo
              </Button>
              <KitchenLink to="/supply/compras" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                Crear la compra a mano
              </KitchenLink>
            </div>
          </>
        )}
      </div>
    )
  }
  if (!invoice.extraction || !match) return <LoadingState variant="block" label="Buscando tus proveedores e insumos…" />

  return (
    <InvoiceReview
      key={invoice.id}
      invoice={{ ...invoice, extraction: invoice.extraction }}
      match={match}
      onSaved={(purchaseId) => navigate(path(`/supply/compras/${purchaseId}`))}
      onDiscarded={() => navigate(path('/supply/compras'))}
    />
  )
}
