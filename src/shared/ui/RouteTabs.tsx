import type { ComponentType } from 'react'
import { NavLink } from 'react-router-dom'

export interface RouteTabItem {
  to: string
  label: string
  icon?: ComponentType<{ size?: number }>
  /** true = solo resalta en match exacto (evita que un padre "roba" el resaltado de sus propias sub-rutas con tab propio, p.ej. /menus vs /menus/dia). Default false. */
  end?: boolean
}

/**
 * Igual estilo visual que Tabs (segmented pill), pero navega por URL en vez
 * de estado local — para la sub-navegación de los módulos agrupados
 * (Cocina, Catálogo, Abastecimiento, Cartera).
 */
export function RouteTabs({ items, label = 'Secciones' }: { items: RouteTabItem[]; label?: string }) {
  return (
    <nav
      aria-label={label}
      className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:inline-flex sm:rounded-full sm:border sm:border-neutral-800/60 sm:bg-neutral-900/60 sm:p-1 sm:px-1 [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500 ${
                isActive ? 'bg-brasa-500 text-white' : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'
              }`
            }
          >
            {Icon && <Icon size={15} />}
            {item.label}
          </NavLink>
        )
      })}
    </nav>
  )
}
