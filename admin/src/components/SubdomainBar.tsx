import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/FormField'
import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, ExternalLink, Globe, PenLine } from 'lucide-react'
import { useState } from 'react'
import { setOrganizationSlug } from '../lib/api'
import { tenantHost, tenantUrl } from '../lib/tenant'

/**
 * The organization's own address (ADR 0021): open it, copy it and — only
 * here — change it. The old subdomain keeps working as a redirect and no
 * other organization can take it.
 */
export function SubdomainBar({ organizationId, slug }: { organizationId: string; slug: string }) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(slug)
  const url = tenantUrl(slug)

  const change = useMutation({
    mutationFn: () => setOrganizationSlug(organizationId, value.trim().toLowerCase()),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ['ga'] })
      setEditing(false)
      show(r.changed ? `Subdominio cambiado: ${tenantHost(r.slug)}. ${tenantHost(r.previous ?? slug)} redirige al nuevo.` : 'Sin cambios.')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo cambiar el subdominio'), 'error'),
  })

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-console-700 bg-console-900 px-3 py-2.5">
      <Globe size={15} className="shrink-0 text-brasa-400" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-mono text-sm text-neutral-100">{tenantHost(slug)}</span>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-console-700 px-3 text-xs font-medium text-neutral-200 hover:bg-console-800"
        >
          <ExternalLink size={13} aria-hidden /> Abrir
        </a>
      )}
      <Button size="sm" variant="secondary" icon={Copy} onClick={() => void navigator.clipboard.writeText(url ?? slug).then(() => show('Dirección copiada.'))}>
        Copiar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon={PenLine}
        onClick={() => {
          setValue(slug)
          setEditing(true)
        }}
      >
        Cambiar
      </Button>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Cambiar el subdominio"
        description={`Hoy: ${tenantHost(slug)}. La dirección anterior seguirá llevando a la nueva y ninguna otra organización podrá usarla.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={change.isPending}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => change.mutate()} loading={change.isPending} disabled={!value.trim() || value.trim() === slug}>
              Cambiar subdominio
            </Button>
          </>
        }
      >
        <label className="block text-xs text-neutral-400">
          Nuevo subdominio (minúsculas, números y guiones)
          <Input value={value} onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} maxLength={60} autoFocus className="!mt-1 font-mono" />
        </label>
        <p className="mt-2 text-xs text-amber-300/90">Avísale a la organización: sus enlaces guardados seguirán funcionando, pero su equipo debería usar la nueva dirección.</p>
      </Modal>
    </div>
  )
}
