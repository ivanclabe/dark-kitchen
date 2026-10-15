import { getErrorMessage } from '@/shared/utils/errors'
import { RefreshCw } from 'lucide-react'
import { Button } from './Button'
import { Feedback } from './Feedback'

/**
 * Estado de error de una consulta: qué pasó + qué hacer. Antes ninguna
 * pantalla manejaba `isError` — un fallo de red dejaba la vista vacía sin
 * explicación. `onRetry` recibe normalmente `refetch` de useQuery.
 *
 * ADR 0060: lo acompaña el robot sorprendido; el mensaje real del error y
 * «Reintentar» siguen a la vista.
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
    <Feedback
      layout="block"
      tone="error"
      compact={compact}
      title={title}
      description={error !== undefined ? getErrorMessage(error, 'Error desconocido') : undefined}
      action={
        onRetry && (
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>
            Reintentar
          </Button>
        )
      }
      className={className}
    />
  )
}
