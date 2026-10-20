import clsx from 'clsx'
import { useState, type CSSProperties } from 'react'

/** Real screens of the app, taken from a demo business with fictional data (public/brand/landing). */
const SCREENS = [
  {
    id: 'inicio',
    name: 'Inicio',
    note: 'Lo que vendiste hoy, lo que necesita atención y cómo va la cocina.',
    src: '/brand/landing/inicio.webp',
    width: 2752,
    height: 1704,
    phone: false,
  },
  {
    id: 'tablero',
    name: 'Tablero',
    note: 'Todos los pedidos del día por estado, con su tiempo y su siguiente paso.',
    src: '/brand/landing/tablero.webp',
    width: 2752,
    height: 1704,
    phone: false,
  },
  {
    id: 'cocina',
    name: 'Cocina',
    note: 'Para la línea: los platos enteros, grandes, y nada que distraiga.',
    src: '/brand/landing/cocina.webp',
    width: 2752,
    height: 1704,
    phone: false,
  },
  {
    id: 'lista',
    name: 'Pedidos',
    note: 'Buscar cualquier pedido por número, cliente, teléfono o plato, y ver qué falta por cobrar.',
    src: '/brand/landing/lista.webp',
    width: 2752,
    height: 1704,
    phone: false,
  },
  {
    id: 'menu',
    name: 'Menú web',
    note: 'Tu menú del día en una página para tus clientes; sus pedidos entran directo a la cocina.',
    src: '/brand/app-menu.webp',
    width: 780,
    height: 1560,
    phone: true,
  },
] as const

/**
 * The app inside, as an index: the names on the left, the selected screen lying on the stage at its own
 * size and cropped by the stage's edges.
 */
export function ProductShowcase() {
  const [selected, setSelected] = useState<(typeof SCREENS)[number]['id']>('tablero')
  const screen = SCREENS.find((s) => s.id === selected) ?? SCREENS[0]
  return (
    <section id="producto-por-dentro" className="px-[var(--l-margin)] py-[clamp(96px,12vw,180px)]" aria-labelledby="landing-showcase">
      <h2 id="landing-showcase" className="sr-only">
        La app por dentro
      </h2>
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-5">
          <ul className="flex flex-wrap gap-x-5 gap-y-1 lg:block lg:space-y-1" role="list">
            {SCREENS.map((s, i) => (
              <li key={s.id} className="shrink-0 snap-start" data-reveal style={{ '--i': i } as CSSProperties}>
                <button
                  type="button"
                  aria-pressed={s.id === selected}
                  onClick={() => setSelected(s.id)}
                  className={clsx(
                    'landing-display rounded-lg text-left text-[length:var(--l-size-title)] transition-colors duration-200 lg:text-[length:var(--l-size-display)] lg:leading-[1.1]',
                    s.id === selected ? 'text-[var(--l-ink)]' : 'text-[#8f7a6d] hover:text-[var(--l-soft)]',
                  )}
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-[34ch] text-[length:var(--l-size-text)] lg:mt-10" aria-live="polite">
            {screen.note}
          </p>
        </div>

        <div className="relative h-[70svh] overflow-hidden rounded-[var(--l-radius)] bg-[var(--l-field)] lg:col-span-7 lg:h-[88svh]">
          <img
            key={screen.id}
            src={screen.src}
            width={screen.width}
            height={screen.height}
            alt={`Pantalla ${screen.name} de quanela con datos de ejemplo`}
            loading="lazy"
            className={clsx(
              'landing-shutter absolute top-4 left-4 max-w-none rounded-xl lg:top-[72px] lg:left-16',
              screen.phone ? 'w-[300px] lg:w-[360px]' : 'w-[960px] lg:w-[1180px]',
            )}
          />
        </div>
      </div>
    </section>
  )
}
