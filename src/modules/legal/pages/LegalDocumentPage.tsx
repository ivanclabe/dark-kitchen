import { legalDocument, LEGAL_PENDING_COMPANY_FIELDS, QUANELA_DOCUMENTS, legalHref, type LegalDocument } from '@/shared/legal/documents'
import { Button } from '@/shared/ui/Button'
import { Download, Printer } from 'lucide-react'
import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { LegalLayout } from '../components/LegalLayout'
import { downloadDocument, formatLegalDate, useInternalLinks } from '../lib'

export function LegalDocumentHeader({ doc, title, onDownload }: { doc: LegalDocument; title: string; onDownload: () => void }) {
  return (
    <header>
      <h1 className="text-2xl font-semibold tracking-tight text-balance text-neutral-50 sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Versión {doc.version} · vigente desde {formatLegalDate(doc.effective)}
      </p>
      <div className="legal-no-print mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon={Download} onClick={onDownload}>
          Descargar
        </Button>
        <Button variant="ghost" size="sm" icon={Printer} onClick={() => window.print()}>
          Imprimir o guardar en PDF
        </Button>
      </div>
    </header>
  )
}

export function LegalDocumentPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const doc = legalDocument(slug)
  const onClick = useInternalLinks()

  useEffect(() => {
    if (doc) document.title = `${doc.title} · quanela`
    // A link to a section (#encargados) lands on it once the document is drawn.
    const id = window.location.hash.slice(1)
    if (id) document.getElementById(decodeURIComponent(id))?.scrollIntoView()
  }, [doc])

  if (!doc || slug === 'politica-cocina') return <Navigate to="/legal" replace />
  const pendingCompany = LEGAL_PENDING_COMPANY_FIELDS.length > 0 && doc.html.includes('legal-pending')

  return (
    <LegalLayout>
      <article className="max-w-3xl">
        <LegalDocumentHeader doc={doc} title={doc.title} onDownload={() => downloadDocument(doc, doc.html)} />
        {pendingCompany && (
          <p role="note" className="legal-no-print mt-6 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-neutral-300">
            Este documento tiene datos marcados como <mark className="legal-pending">Pendiente</mark>: la empresa aún debe completarlos.
          </p>
        )}
        {doc.toc.length > 3 && (
          <nav aria-label="Contenido del documento" className="legal-no-print mt-8 rounded-2xl border border-neutral-800/60 p-4">
            <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Contenido</p>
            <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {doc.toc.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="text-neutral-300 hover:text-neutral-50">
                    {item.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="legal-prose mt-8" onClick={onClick} dangerouslySetInnerHTML={{ __html: doc.html }} />
      </article>
    </LegalLayout>
  )
}

export function LegalIndexPage() {
  useEffect(() => {
    document.title = 'Documentos legales · quanela'
  }, [])
  return (
    <LegalLayout>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50 sm:text-3xl">Documentos legales</h1>
        <p className="mt-2 text-neutral-400">Las condiciones del servicio y cómo tratamos tus datos, en palabras claras.</p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {QUANELA_DOCUMENTS.map((doc) => (
            <li key={doc.slug}>
              <Link to={legalHref(doc.slug)} className="block h-full rounded-2xl border border-neutral-800 p-4 transition-colors hover:border-neutral-50/40 hover:bg-neutral-900">
                <span className="block font-medium text-neutral-100">{doc.title}</span>
                <span className="mt-1 block text-sm text-neutral-400">{doc.summary}</span>
                <span className="mt-2 block text-xs text-neutral-500">
                  Versión {doc.version} · desde {formatLegalDate(doc.effective)}
                </span>
              </Link>
            </li>
          ))}
          <li>
            <Link to="/legal/preferencias" className="block h-full rounded-2xl border border-neutral-800 p-4 transition-colors hover:border-neutral-50/40 hover:bg-neutral-900">
              <span className="block font-medium text-neutral-100">Preferencias de privacidad</span>
              <span className="mt-1 block text-sm text-neutral-400">Qué guarda quanela en tu navegador y qué puedes apagar.</span>
            </Link>
          </li>
        </ul>
      </div>
    </LegalLayout>
  )
}

