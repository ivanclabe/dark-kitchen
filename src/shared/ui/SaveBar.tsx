import { Button } from './Button'
import clsx from 'clsx'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'

/** How long "Guardado" stays after saving. */
const SAVED_MS = 3000

/**
 * The one way to save in Configuración (ADR 0026, D4): «Descartar» and
 * «Guardar cambios», only while there are changes; «Guardando…» while it
 * saves; «✓ Guardado» for a moment after; the error inline with «Reintentar».
 * Inside a <form> the save button submits it; otherwise it calls `onSave`.
 */
export function SaveBar({
  dirty,
  saving,
  savedAt,
  error,
  invalid = false,
  onDiscard,
  onSave,
  className,
}: {
  dirty: boolean
  saving: boolean
  /** Date.now() of the last successful save (shows «Guardado»). */
  savedAt?: number | null
  error?: string | null
  /** The changes cannot be saved yet (a field with an error). */
  invalid?: boolean
  onDiscard: () => void
  onSave?: () => void
  className?: string
}) {
  const [now, setNow] = useState(() => Date.now())
  const justSaved = Boolean(savedAt && now - savedAt < SAVED_MS && !dirty)
  useEffect(() => {
    if (!savedAt) return
    // A fresh save is newer than `now`, so it shows at once; this hides it later.
    const id = window.setTimeout(() => setNow(Date.now()), SAVED_MS)
    return () => window.clearTimeout(id)
  }, [savedAt])

  if (!dirty && !justSaved && !error) return null

  return (
    <div className={clsx('flex flex-wrap items-center justify-end gap-x-3 gap-y-2', className)} aria-live="polite">
      {error && !saving && <p className="mr-auto text-sm text-red-400">{error}</p>}
      {justSaved && (
        <p className="mr-auto inline-flex items-center gap-1.5 text-sm text-emerald-400">
          <Check size={15} aria-hidden /> Guardado
        </p>
      )}
      {dirty && (
        <>
          <Button variant="ghost" onClick={onDiscard} disabled={saving}>
            Descartar
          </Button>
          <Button type={onSave ? 'button' : 'submit'} variant="primary" loading={saving} disabled={invalid} onClick={onSave}>
            {saving ? 'Guardando…' : error ? 'Reintentar' : 'Guardar cambios'}
          </Button>
        </>
      )}
    </div>
  )
}
