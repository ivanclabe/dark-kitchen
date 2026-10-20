import '@/modules/legal/legal.css'
import { downloadDocument, useInternalLinks } from '@/modules/legal/lib'
import { LegalDocumentHeader } from '@/modules/legal/pages/LegalDocumentPage'
import { supabase } from '@/shared/lib/supabase'
import { kitchenPolicyHtml, kitchenPolicyTitle, legalDocument, type KitchenPrivacy } from '@/shared/legal/documents'
import { LoadingState } from '@/shared/ui/LoadingState'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'

async function fetchKitchenPrivacy(slug: string): Promise<KitchenPrivacy | null> {
  const { data, error } = await supabase.rpc('dk_public_kitchen_privacy', { p_slug: slug })
  if (error) throw error
  return (data as KitchenPrivacy | null) ?? null
}

/**
 * The data policy of a business for the customers who order from its public menu or by WhatsApp
 * (ADR 0071): the business is the Responsable; Quanela, its Encargado. Built from a template with the
 * business's own data; what it has not filled in says so.
 */
export function KitchenPolicyPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const template = legalDocument('politica-cocina')!
  const kitchen = useQuery({ queryKey: ['public-kitchen-privacy', slug], queryFn: () => fetchKitchenPrivacy(slug) })
  const onClick = useInternalLinks()
  const title = kitchen.data ? kitchenPolicyTitle(template.title, kitchen.data) : ''
  const html = kitchen.data ? kitchenPolicyHtml(template.html, kitchen.data) : ''

  useEffect(() => {
    if (title) document.title = title
  }, [title])

  return (
    <div className="min-h-dvh bg-neutral-950 text-neutral-100">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <Link to={`/menu/${slug}`} className="legal-no-print inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-100">
          <ArrowLeft size={14} aria-hidden /> Volver al menú
        </Link>
        {kitchen.isLoading ? (
          <LoadingState variant="block" label="Cargando la política…" />
        ) : !kitchen.data ? (
          <p className="mt-8 text-neutral-300">Este negocio no tiene un menú publicado.</p>
        ) : (
          <article className="mt-6">
            <LegalDocumentHeader doc={template} title={title} onDownload={() => downloadDocument({ ...template, title }, html)} />
            <div className="legal-prose mt-8" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
          </article>
        )}
      </main>
    </div>
  )
}
