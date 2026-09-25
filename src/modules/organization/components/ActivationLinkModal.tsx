import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

/** Enlace de activación recién creado: se muestra una sola vez (en la base solo queda su hash). */
export function ActivationLinkModal({ link, name, email, onClose }: { link: string; name: string; email: string; onClose: () => void }) {
  const { show } = useToast()
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(link).then(
      () => {
        setCopied(true)
        show('Enlace copiado.')
      },
      () => show('No se pudo copiar el enlace; selecciónalo y cópialo a mano.', 'error'),
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Usuario creado"
      description={`Envíale este enlace a ${name} (${email}) por WhatsApp o correo. Con él define su contraseña y entra. Vence en 7 días.`}
      footer={
        <Button variant="primary" onClick={onClose}>
          Listo
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
          <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Enlace de activación" className="min-w-0 flex-1 bg-transparent text-xs text-neutral-200 outline-none" />
          <Button size="sm" variant={copied ? 'secondary' : 'primary'} icon={copied ? Check : Copy} onClick={copy}>
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
        <p className={typography.caption}>Por seguridad no se vuelve a mostrar. Si se pierde, genera uno nuevo desde el usuario (el anterior deja de valer).</p>
      </div>
    </Modal>
  )
}
