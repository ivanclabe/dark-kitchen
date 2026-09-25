import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { typography } from '@/shared/ui/typography'
import { Clock, PartyPopper, Soup, UserPlus, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

/**
 * Bienvenida al entrar por primera vez a una Cuenta recién creada
 * (?bienvenida=1, ADR 0008 sección 8): tres atajos opcionales, nunca un
 * paso obligatorio ni una pantalla vacía.
 */
export function WelcomeCard() {
  const { kitchen, can, path } = useActiveKitchen()
  const [params, setParams] = useSearchParams()
  if (params.get('bienvenida') !== '1') return null

  const dismiss = () => {
    const next = new URLSearchParams(params)
    next.delete('bienvenida')
    setParams(next, { replace: true })
  }

  const shortcuts = [
    can('products.create') && { to: path('/menu-planner'), icon: Soup, title: 'Carga tu primer plato', text: 'Nombre, precio y su receta.' },
    can('settings.manage') && { to: path('/kitchen'), icon: Clock, title: 'Configura tu horario', text: 'En Cocina → ⋯ → Configuración.' },
    can('team.manage') && { to: path('/users'), icon: UserPlus, title: 'Suma a tu equipo', text: 'Crea sus usuarios y asígnales un rol.' },
  ].filter(Boolean) as { to: string; icon: typeof Soup; title: string; text: string }[]

  return (
    <section className="relative mb-6 rounded-2xl border border-brasa-500/30 bg-brasa-500/5 p-5" aria-label="Bienvenida">
      <button type="button" onClick={dismiss} aria-label="Cerrar bienvenida" className="absolute top-3 right-3 rounded-lg p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200">
        <X size={16} aria-hidden />
      </button>
      <p className="flex items-center gap-2 font-semibold text-neutral-50">
        <PartyPopper size={18} className="text-brasa-400" aria-hidden /> ¡{kitchen.name} está lista!
      </p>
      <p className={`mt-1 ${typography.small}`}>Puedes empezar por aquí (o cerrar esto y explorar por tu cuenta):</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {shortcuts.map((s) => (
          <li key={s.to}>
            <Link to={s.to} onClick={dismiss} className="flex h-full items-start gap-3 rounded-xl border border-neutral-800/60 bg-neutral-900/60 p-3 transition-colors hover:border-brasa-500/40">
              <s.icon size={18} className="mt-0.5 shrink-0 text-brasa-400" aria-hidden />
              <span>
                <span className="block text-sm font-medium text-neutral-100">{s.title}</span>
                <span className="block text-xs text-neutral-500">{s.text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
