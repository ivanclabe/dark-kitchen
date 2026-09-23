import { ArrowLeft } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { typography } from './typography'

/**
 * Encabezado único de página: responde "¿dónde estoy?" (título + ícono),
 * "¿qué estoy viendo?" (description / meta) y "¿qué puedo hacer?" (actions,
 * con la acción primaria a la derecha). Antes había 6 variantes a mano.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  meta,
  backTo,
  backLabel = 'Volver',
}: {
  title: ReactNode
  description?: ReactNode
  icon?: ComponentType<{ size?: number; className?: string }>
  /** Botones de acción — poner la primaria al final. */
  actions?: ReactNode
  /** Badges/píldoras junto al título (estado, contador). */
  meta?: ReactNode
  backTo?: string
  backLabel?: string
}) {
  return (
    <header className="flex flex-col gap-3">
      {backTo && (
        <Link to={backTo} className="inline-flex w-fit items-center gap-1 text-sm text-neutral-400 transition-colors hover:text-neutral-100">
          <ArrowLeft size={14} aria-hidden /> {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-brasa-500/20 bg-brasa-500/10 text-brasa-400">
              <Icon size={18} aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className={typography.h1}>{title}</h1>
              {meta}
            </div>
            {description && <p className={`mt-0.5 ${typography.small}`}>{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

/** Encabezado de sección dentro de una página (h2 + acción opcional). */
export function SectionHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className={typography.h2}>{title}</h2>
        {description && <p className={`mt-0.5 ${typography.caption}`}>{description}</p>}
      </div>
      {actions}
    </div>
  )
}
