import type { LegalDocument } from '@/shared/legal/documents'
import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'

export function formatLegalDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** The HTML file the person keeps (Ley 1480 art. 50: terms always available and downloadable). */
export function downloadDocument(doc: Pick<LegalDocument, 'slug' | 'title' | 'version' | 'effective' | 'sha256'>, html: string) {
  const page = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${doc.title} · versión ${doc.version}</title>
<style>body{font:16px/1.65 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1c1310}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:.4rem;text-align:left;vertical-align:top}mark{background:#fde68a}</style>
</head><body><h1>${doc.title}</h1><p>Versión ${doc.version} · vigente desde ${formatLegalDate(doc.effective)}<br><small>SHA-256: ${doc.sha256}</small></p>${html}</body></html>`
  const url = URL.createObjectURL(new Blob([page], { type: 'text/html;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `quanela-${doc.slug}-v${doc.version}.html`
  a.click()
  URL.revokeObjectURL(url)
}

/** Internal links of the document move inside the app (without reloading it). */
export function useInternalLinks() {
  const navigate = useNavigate()
  return (e: MouseEvent<HTMLElement>) => {
    const link = (e.target as HTMLElement).closest('a')
    const href = link?.getAttribute('href')
    if (!href || !href.startsWith('/') || link?.target === '_blank' || e.metaKey || e.ctrlKey) return
    e.preventDefault()
    navigate(href)
  }
}
