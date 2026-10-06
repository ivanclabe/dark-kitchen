import { Button } from '@/shared/ui/Button'
import { FormField, Textarea } from '@/shared/ui/FormField'
import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { Copy, Mail } from 'lucide-react'
import { useState } from 'react'
import { diagnosticsText, reportMailto, supportEmail } from './support'

const SHORTCUTS: { keys: string[]; what: string; where: string }[] = [
  { keys: ['N'], what: 'Nuevo pedido', where: 'Operación' },
  { keys: ['/'], what: 'Buscar', where: 'Operación' },
  { keys: ['Ctrl/⌘', 'J'], what: 'Abrir o cerrar Copilot', where: 'Toda la cuenta' },
  { keys: ['Ctrl/⌘', 'Shift', 'J'], what: 'Hablarle a Quanela (sin decir «Oye Quanela»)', where: 'Toda la cuenta' },
  { keys: ['Esc'], what: 'Cerrar un panel, un menú o una ventana', where: 'Toda la app' },
  { keys: ['↑', '↓'], what: 'Moverse en un menú', where: 'Menús' },
  { keys: ['→', '←'], what: 'Abrir o cerrar un submenú', where: 'Menú de usuario' },
  { keys: ['Enter'], what: 'Elegir la opción enfocada', where: 'Menús y listas' },
]

function Key({ children }: { children: string }) {
  return <kbd className="inline-flex min-w-6 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-mono text-[11px] text-neutral-200">{children}</kbd>
}

export function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Atajos de teclado" description="Funcionan cuando no estás escribiendo en un campo.">
      <ul className="divide-y divide-neutral-800">
        {SHORTCUTS.map((s) => (
          <li key={s.what} className="flex items-center justify-between gap-4 py-2 text-sm">
            <span>
              <span className="block text-neutral-100">{s.what}</span>
              <span className="block text-xs text-neutral-500">{s.where}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {s.keys.map((k) => (
                <Key key={k}>{k}</Key>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

function DiagnosticsList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-neutral-500">{k}</dt>
          <dd className="min-w-0 truncate text-right text-neutral-200" title={v}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function useCopy() {
  const { show } = useToast()
  return (text: string, done: string) =>
    void navigator.clipboard.writeText(text).then(
      () => show(done),
      () => show('No se pudo copiar', 'error'),
    )
}

/** Detalles de la sesión (ADR 0023): where the person is, to tell support. No secrets. */
export function SessionDetailsDialog({ rows, onClose }: { rows: [string, string][]; onClose: () => void }) {
  const copy = useCopy()
  return (
    <Modal
      open
      onClose={onClose}
      title="Detalles de la sesión"
      description="Si soporte te pregunta dónde estás, copia estos datos. No incluyen contraseñas ni datos de clientes."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="primary" icon={Copy} onClick={() => copy(diagnosticsText(rows), 'Detalles copiados.')}>
            Copiar
          </Button>
        </>
      }
    >
      <DiagnosticsList rows={rows} />
    </Modal>
  )
}

/**
 * Reportar un problema: what happened, plus the session details. With a
 * support e-mail configured it opens a ready e-mail; always it can be copied.
 */
export function ReportProblemDialog({ rows, onClose }: { rows: [string, string][]; onClose: () => void }) {
  const [description, setDescription] = useState('')
  const copy = useCopy()
  const email = supportEmail()
  const text = `${description.trim()}\n\n— Datos para soporte —\n${diagnosticsText(rows)}`
  return (
    <Modal
      open
      onClose={onClose}
      title="Reportar un problema"
      description="Cuéntanos qué pasó y qué esperabas. Agregamos los datos de tu sesión para ubicarte rápido."
      footer={
        <>
          <Button variant="ghost" icon={Copy} onClick={() => copy(text, 'Reporte copiado.')} disabled={!description.trim()}>
            Copiar reporte
          </Button>
          {email && (
            <a
              href={description.trim() ? reportMailto(email, description, rows) : undefined}
              aria-disabled={!description.trim()}
              onClick={(e) => {
                if (!description.trim()) e.preventDefault()
                else onClose()
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brasa-500 px-4 text-sm font-semibold text-white hover:bg-brasa-400 aria-disabled:pointer-events-none aria-disabled:opacity-40"
            >
              <Mail size={15} aria-hidden /> Enviar por correo
            </a>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="¿Qué pasó?" required>
          {(a11y) => (
            <Textarea {...a11y} rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. al confirmar el pedido 1015 sale un error de stock" autoFocus />
          )}
        </FormField>
        <DiagnosticsList rows={rows} />
        {!email && <p className="text-xs text-neutral-500">Copia el reporte y envíalo a quien te da soporte.</p>}
      </div>
    </Modal>
  )
}
