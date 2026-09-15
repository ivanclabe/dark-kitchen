import { cardClass } from '@/shared/ui/formClasses'
import type { ComponentType } from 'react'

/** Placeholder temporal para las vistas que se construyen en los próximos pasos de esta iteración. */
export function ComingSoonView({ icon: Icon, label }: { icon: ComponentType<{ size?: number; className?: string }>; label: string }) {
  return (
    <div className={`${cardClass} flex flex-col items-center gap-2 py-12 text-center text-neutral-500`}>
      <Icon size={28} className="text-neutral-700" />
      <p className="text-sm">La vista {label} se agrega en el siguiente paso de esta iteración.</p>
    </div>
  )
}
