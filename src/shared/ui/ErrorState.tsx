import { getErrorMessage } from '@/shared/utils/errors'
import clsx from 'clsx'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './Button'
import { typography } from './typography'

/**
 * Estado de error de una consulta: qué pasó + qué hacer. Antes ninguna
 * pantalla manejaba `isError` — un fallo de red dejaba la vista vacía sin
 * explicación. `onRetry` recibe normalmente `refetch` de useQuery.
 */
export function ErrorState({
  error,
  title = 'No se pudo cargar la información',
  onRetry,
  compact = false,
  className,
}: {
  error?: unknown
  title?: string
  onRetry?: () => void
  compact?: boolean
  className?: string
}) {
  return (
    <div
      role="alert"
      className={clsx(
        'flex flex-col items-center justify-center gap-2 rounded-2xl border border-red-900/40 bg-red-950/20 text-center',
        compact ? 'px-4 py-6' : 'px-6 py-12',
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
        <AlertTriangle size={18} aria-hidden />
      </span>
      <p className={typography.h3}>{title}</p>
      {error !== undefined && <p className={clsx('max-w-md', typography.small)}>{getErrorMessage(error, 'Error desconocido')}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry} className="mt-2">
          Reintentar
        </Button>
      )}
    </div>
  )
}
