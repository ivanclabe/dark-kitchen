import { createPqr, exportMyData, fetchMyLegalAcceptances, fetchMyPqrs, type PqrKind, type PqrRequest } from '@/shared/legal/api'
import { legalHref } from '@/shared/legal/documents'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Badge, type BadgeTone } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { FormActions, FormField, Select, Textarea } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Page } from '@/shared/ui/Page'
import { PageHeader } from '@/shared/ui/PageHeader'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate, formatDateTime } from '@/shared/utils/format'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileCheck2, Inbox, Send, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { useState, type FormEvent } from 'react'

const KIND: Record<PqrKind, { label: string; hint: string; billing?: boolean }> = {
  consulta: { label: 'Consulta sobre mis datos', hint: 'Qué datos tuyos tenemos y cómo los usamos. Respuesta en 10 días hábiles.' },
  rectificacion: { label: 'Corregir mis datos', hint: 'Algún dato tuyo está mal o desactualizado. Respuesta en 15 días hábiles.' },
  supresion: { label: 'Eliminar mis datos', hint: 'Borramos tus datos, salvo los que la ley nos obliga a conservar (como la facturación). Respuesta en 15 días hábiles.' },
  revocatoria: { label: 'Revocar mi autorización', hint: 'Dejar de autorizar un uso de tus datos. Respuesta en 15 días hábiles.' },
  reclamo: { label: 'Reclamo sobre mis datos', hint: 'Crees que tus datos no se trataron como dice la política. Respuesta en 15 días hábiles.' },
  retracto: { label: 'Retracto (reembolso total)', hint: 'Dentro de los 5 días hábiles siguientes al primer pago. Respuesta en 15 días hábiles.', billing: true },
  reembolso: { label: 'Reembolso por un cobro errado', hint: 'Un cobro duplicado, de otro valor o que no correspondía. Respuesta en 15 días hábiles.', billing: true },
  queja: { label: 'Otra petición o queja', hint: 'Sobre el servicio o la facturación. Respuesta en 15 días hábiles.' },
}

const STATUS: Record<PqrRequest['status'], { label: string; tone: BadgeTone }> = {
  radicada: { label: 'Radicada', tone: 'info' },
  en_tramite: { label: 'En trámite', tone: 'warning' },
  incompleta: { label: 'Falta información', tone: 'warning' },
  respondida: { label: 'Respondida', tone: 'success' },
  cerrada: { label: 'Cerrada', tone: 'neutral' },
}

const CONTEXT: Record<string, string> = {
  signup: 'Al crear tu cuenta',
  activation: 'Al activar tu usuario',
  app_gate: 'Al entrar a Quanela',
  reacceptance: 'Nueva versión',
  billing_renewal: 'Al guardar la tarjeta',
}

function NewRequest() {
  const { organization, canShared } = useActiveKitchen()
  const queryClient = useQueryClient()
  const { show } = useToast()
  // The database checks billing.manage; whoever cannot see billing does not get the option.
  const canBill = canShared('billing.view')
  const kinds = (Object.keys(KIND) as PqrKind[]).filter((k) => !KIND[k].billing || canBill)
  const [kind, setKind] = useState<PqrKind>('consulta')
  const [description, setDescription] = useState('')
  const create = useMutation({
    mutationFn: () => createPqr({ kind, description, organizationId: KIND[kind].billing ? organization?.id : undefined }),
    onSuccess: async (r) => {
      setDescription('')
      show(`Radicamos tu solicitud ${r.radicado}. Te respondemos a más tardar el ${formatDate(r.dueDate)}.`, 'success')
      await queryClient.invalidateQueries({ queryKey: ['my-pqrs'] })
    },
    onError: (err) => show(getErrorMessage(err, 'No pudimos radicar la solicitud'), 'error'),
  })
  const tooShort = description.trim().length < 10

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        if (!tooShort) create.mutate()
      }}
      className="space-y-4"
    >
      <FormField label="Tipo de solicitud" hint={KIND[kind].hint}>
        {(a11y) => (
          <Select {...a11y} value={kind} onChange={(e) => setKind(e.target.value as PqrKind)} className="max-w-md">
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND[k].label}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <FormField label="Cuéntanos qué necesitas" required hint="Mínimo 10 caracteres. No incluyas contraseñas ni números de tarjeta.">
        {(a11y) => <Textarea {...a11y} value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={4000} />}
      </FormField>
      <FormActions>
        <Button type="submit" variant="primary" icon={Send} disabled={tooShort} loading={create.isPending}>
          Radicar solicitud
        </Button>
      </FormActions>
    </form>
  )
}

function Requests() {
  const requests = useQuery({ queryKey: ['my-pqrs'], queryFn: fetchMyPqrs })
  if (requests.isLoading) return <LoadingState variant="block" label="Cargando tus solicitudes…" />
  if (requests.isError) return <ErrorState error={requests.error} onRetry={() => void requests.refetch()} compact />
  if (!requests.data?.length) return <EmptyState icon={Inbox} title="Sin solicitudes" description="Aquí verás cada solicitud con su radicado, su plazo y la respuesta." compact />
  return (
    <ul className="divide-y divide-neutral-800/60">
      {requests.data.map((r) => (
        <li key={r.id} className="py-4 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-neutral-100">{r.radicado}</span>
            <Badge size="sm" tone={STATUS[r.status].tone}>
              {STATUS[r.status].label}
            </Badge>
            <span className="text-sm text-neutral-400">{KIND[r.kind]?.label ?? r.kind}</span>
          </div>
          <p className={`mt-1 ${typography.caption}`}>
            Radicada el {formatDateTime(r.createdAt)} · respuesta a más tardar el {formatDate(r.extendedDueDate ?? r.dueDate)}
            {r.extendedDueDate && ' (plazo prorrogado)'} · {r.legalBasis}
          </p>
          <p className="mt-2 text-sm whitespace-pre-line text-neutral-300">{r.description}</p>
          {r.response && (
            <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
              <p className="text-xs font-medium text-emerald-400">Respuesta{r.answeredAt ? ` · ${formatDate(r.answeredAt)}` : ''}</p>
              <p className="mt-1 whitespace-pre-line text-neutral-200">{r.response}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * Privacidad y datos (ADR 0071): the documents this person accepted, their data in a file, and the requests
 * the law gives them (Ley 1581 arts. 8, 14 and 15; refunds and withdrawal), each with a radicado and its term.
 */
export function PrivacyCenterPage() {
  const { show } = useToast()
  const { path } = useActiveKitchen()
  const acceptances = useQuery({ queryKey: ['my-legal-acceptances'], queryFn: fetchMyLegalAcceptances })
  const download = useMutation({
    mutationFn: exportMyData,
    onSuccess: (data) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `quanela-mis-datos-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    },
    onError: (err) => show(getErrorMessage(err, 'No pudimos preparar tus datos'), 'error'),
  })

  return (
    <Page>
      <PageHeader
        help="switch-account"
        title="Privacidad y datos"
        icon={ShieldCheck}
        backTo={path('/perfil')}
        backLabel="Mi perfil"
        description="Los documentos que aceptaste, tus datos y tus solicitudes sobre datos personales, reembolsos o quejas."
      />
      <div className="max-w-3xl space-y-6">
        <Card title="Documentos que aceptaste" icon={FileCheck2} description="Cada aceptación queda guardada con su versión y su fecha. Nunca se borra ni se modifica.">
          {acceptances.isLoading ? (
            <LoadingState variant="block" />
          ) : acceptances.isError ? (
            <ErrorState error={acceptances.error} onRetry={() => void acceptances.refetch()} compact />
          ) : !acceptances.data?.length ? (
            <p className={typography.small}>Aún no hay aceptaciones registradas.</p>
          ) : (
            <ul className="divide-y divide-neutral-800/60 text-sm">
              {acceptances.data.map((a, i) => (
                <li key={`${a.slug}-${a.version}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                  <a href={legalHref(a.slug)} target="_blank" rel="noopener noreferrer" className="font-medium text-neutral-100 hover:text-brasa-300">
                    {a.title} · versión {a.version}
                  </a>
                  <span className="text-xs text-neutral-500">
                    {CONTEXT[a.context] ?? a.context} · {formatDateTime(a.consentedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <a href="/legal" target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm text-brasa-400 hover:underline">
            Ver todos los documentos legales
          </a>
        </Card>

        <Card title="Tus datos" icon={Download} description="Un archivo con tu perfil, tus negocios, tus aceptaciones y tus solicitudes.">
          <Button variant="secondary" icon={Download} loading={download.isPending} onClick={() => download.mutate()}>
            Descargar mis datos
          </Button>
        </Card>

        <Card title="Nueva solicitud" icon={Send} description="Recibes un número de radicado y ves el plazo que tenemos para responderte.">
          <NewRequest />
        </Card>

        <Card title="Tus solicitudes" icon={Inbox}>
          <Requests />
        </Card>

        <Card title="Preferencias de privacidad" icon={SlidersHorizontal} description="Qué guarda Quanela en este navegador. Hoy no usamos analítica ni publicidad.">
          <a href="/legal/preferencias" target="_blank" rel="noopener noreferrer" className="text-sm text-brasa-400 hover:underline">
            Abrir preferencias de privacidad
          </a>
        </Card>
      </div>
    </Page>
  )
}
