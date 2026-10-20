import { FullScreenLoading } from '@/app/FullScreenLoading'
import { BrandMark } from '@/shared/brand/BrandMark'
import { useAuth } from '@/shared/hooks/useAuth'
import { Button } from '@/shared/ui/Button'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fetchPendingLegalDocuments, LEGAL_PENDING_KEY, recordLegalAcceptance, STALE_VERSION, type PendingLegalDocument } from './api'
import { legalDocument, legalHref } from './documents'
import { clearPreConsent, preConsentOf, readPreConsent } from './preConsent'


function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

const LABEL: Record<string, (title: string) => string> = {
  terminos: (t) => `Acepto los ${t}`,
  privacidad: (t) => `He leído y acepto la ${t}`,
}

function covers(consent: { documents: { slug: string; version: string }[] } | null, pending: PendingLegalDocument[]) {
  return Boolean(consent) && pending.every((p) => consent!.documents.some((d) => d.slug === p.slug && d.version === p.version))
}

/**
 * Before using the app, the signed-in person accepts the documents in force (ADR 0071): the first time
 * (accounts created before this existed, invited staff) and when a version asks for a new acceptance.
 * One box per document; previous acceptances are never touched. Declining means signing out.
 */
export function LegalAcceptanceGate({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth()
  const queryClient = useQueryClient()
  const userId = session?.user.id
  const pending = useQuery({ queryKey: [...LEGAL_PENDING_KEY, userId], queryFn: fetchPendingLegalDocuments, enabled: Boolean(userId), staleTime: 5 * 60_000 })
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const autoTried = useRef(false)

  const accept = useMutation({
    mutationFn: (input: { documents: PendingLegalDocument[]; context: 'signup' | 'app_gate' | 'reacceptance' }) =>
      recordLegalAcceptance({ documents: input.documents.map(({ slug, version }) => ({ slug, version })), context: input.context }),
    onSuccess: () => {
      clearPreConsent()
      return queryClient.invalidateQueries({ queryKey: LEGAL_PENDING_KEY })
    },
  })

  // Ticked at sign-up but not recorded yet (the confirmation page failed or was skipped): record it now,
  // only if it was exactly these versions.
  // In reading order (Terms first), as everywhere else.
  const docs = [...(pending.data ?? [])].sort((a, b) => (legalDocument(a.slug)?.order ?? 99) - (legalDocument(b.slug)?.order ?? 99))
  const signupConsent = readPreConsent() ?? preConsentOf(session?.user.user_metadata)
  const autoRecord = docs.length > 0 && covers(signupConsent, docs)
  // react-query keeps `pending.data` and `mutate` stable between renders.
  const { mutate } = accept
  useEffect(() => {
    if (!autoRecord || autoTried.current || !pending.data) return
    autoTried.current = true
    mutate({ documents: pending.data, context: 'signup' })
  }, [autoRecord, pending.data, mutate])

  if (pending.isLoading) return <FullScreenLoading stage="session" />
  // A failure here never locks people out of their work: the server asks again next time.
  if (pending.isError || docs.length === 0) return children
  if (autoRecord && !accept.isError) return <FullScreenLoading stage="session" />

  // The page was built with an older text than the one in force: reload before reading and accepting.
  const outdated = docs.some((d) => legalDocument(d.slug)?.version !== d.version)
  const isNew = docs.some((d) => d.reason === 'new_version')
  const allChecked = docs.every((d) => checked[d.slug])
  const staleError = accept.error && (accept.error as { hint?: string }).hint === STALE_VERSION

  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-950 px-4 py-10 text-neutral-100">
      <div className="w-full max-w-lg space-y-5 rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-6">
        <BrandMark className="size-10" />
        <div>
          <h1 className={typography.h2}>{isNew ? 'Actualizamos nuestros documentos' : 'Antes de seguir'}</h1>
          <p className={`mt-1 ${typography.small}`}>
            {isNew
              ? 'Revisa los cambios y acéptalos para seguir usando Quanela. Lo que aceptaste antes queda guardado en tu historial.'
              : 'Para usar Quanela necesitamos que leas y aceptes estos documentos. Cada uno se acepta por separado.'}
          </p>
        </div>
        {outdated || staleError ? (
          <div className="space-y-3">
            <p className="text-sm text-neutral-300">Hay una versión más reciente de estos documentos. Recarga la página para leerla.</p>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Recargar
            </Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (allChecked) accept.mutate({ documents: docs, context: isNew ? 'reacceptance' : 'app_gate' })
            }}
          >
            <fieldset className="space-y-3">
              <legend className="sr-only">Documentos por aceptar</legend>
              {docs.map((doc) => (
                <label key={doc.slug} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-neutral-800 p-3 text-sm leading-snug text-neutral-300">
                  <input
                    type="checkbox"
                    required
                    checked={Boolean(checked[doc.slug])}
                    onChange={(e) => setChecked((c) => ({ ...c, [doc.slug]: e.target.checked }))}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                  />
                  <span>
                    {(LABEL[doc.slug] ?? ((t: string) => `Acepto: ${t}`))(doc.title)}{' '}
                    <a href={legalHref(doc.slug)} target="_blank" rel="noopener noreferrer" className="font-medium text-brasa-400 underline underline-offset-2">
                      (leer)
                    </a>
                    <span className="mt-0.5 block text-xs text-neutral-500">
                      Versión {doc.version} · vigente desde {formatDate(doc.effectiveDate)}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {accept.isError && (
              <p role="alert" className="text-sm text-red-400">
                {getErrorMessage(accept.error, 'No pudimos guardar tu aceptación. Inténtalo de nuevo.')}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
              <Button type="submit" variant="primary" disabled={!allChecked} loading={accept.isPending}>
                Aceptar y continuar
              </Button>
              <Button type="button" variant="ghost" onClick={() => void signOut()}>
                No acepto · cerrar sesión
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
