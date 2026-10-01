import { Button, type ButtonSize, type ButtonVariant } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, KeyRound, MessageCircle, Share2 } from 'lucide-react'
import { useState } from 'react'
import { createPasswordLink, type PasswordLink } from '../lib/api'
import { shareMessage } from '../lib/passwordLink'

/**
 * "Enlace para crear contraseña" (ADR 0019): a one-time link, shared by hand
 * (copy, WhatsApp…), for the person to set their OWN password. Nothing is
 * e-mailed, so it works without SMTP. Each new link replaces the previous one.
 */
export function PasswordLinkButton({ userId, variant = 'secondary', size = 'md' }: { userId: string; variant?: ButtonVariant; size?: ButtonSize }) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const [result, setResult] = useState<PasswordLink | null>(null)
  const generate = useMutation({
    mutationFn: () => createPasswordLink(userId),
    onSuccess: async (r) => {
      setResult(r)
      await queryClient.invalidateQueries({ queryKey: ['ga'] })
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo generar el enlace'), 'error'),
  })

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <>
      <Button variant={variant} size={size} icon={KeyRound} loading={generate.isPending} onClick={() => generate.mutate()}>
        Enlace para crear contraseña
      </Button>
      <Modal
        open={result !== null}
        onClose={() => setResult(null)}
        title="Enlace para crear contraseña"
        description={
          result && (
            <>
              Para <span className="text-neutral-100">{result.name}</span> · {result.email}.{' '}
              {result.mode === 'activation' ? 'Al abrirlo activa su usuario y crea su contraseña.' : 'Al abrirlo crea una contraseña nueva.'}
            </>
          )
        }
        footer={
          <Button variant="ghost" onClick={() => setResult(null)}>
            Cerrar
          </Button>
        }
      >
        {result && (
          <div className="space-y-3">
            <p className="break-all rounded-lg border border-neutral-800 bg-neutral-950 p-3 font-mono text-xs text-neutral-300">{result.link}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" icon={Copy} onClick={() => void navigator.clipboard.writeText(result.link).then(() => show('Enlace copiado.'))}>
                Copiar enlace
              </Button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareMessage(result))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-neutral-700 px-3 text-xs font-medium text-neutral-200 hover:bg-neutral-800"
              >
                <MessageCircle size={14} aria-hidden /> WhatsApp
              </a>
              {canShare && (
                <Button size="sm" variant="secondary" icon={Share2} onClick={() => void navigator.share({ title: 'Quanela', text: shareMessage(result) }).catch(() => undefined)}>
                  Compartir
                </Button>
              )}
            </div>
            <p className="text-xs text-amber-300/90">Es de un solo uso, vence en 1 hora y deja entrar a esa cuenta: compártelo solo con esa persona. Si generas otro, este deja de servir.</p>
          </div>
        )}
      </Modal>
    </>
  )
}
