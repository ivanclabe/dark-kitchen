import { formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { Clock, Copy, PackageCheck, Tag } from 'lucide-react'
import { useState, type CSSProperties } from 'react'

/**
 * One example week of the planner (fictional dishes of a fictional business). Each dish in a day carries the
 * rules the app lets you set there: hours, a promotional price, a unit limit, or sold out (help: «Reglas de un
 * plato en un día»).
 */
interface PlannedDish {
  name: string
  price: number
  hours?: string
  promo?: number
  limit?: string
  soldOut?: boolean
}

const WEEK: { day: string; date: string; dishes: PlannedDish[] }[] = [
  {
    day: 'Lun',
    date: '19',
    dishes: [
      { name: 'Corrientazo', price: 18000, hours: '11:30 a 15:00', limit: '60 unidades' },
      { name: 'Hamburguesa de la casa', price: 22000 },
    ],
  },
  {
    day: 'Mar',
    date: '20',
    dishes: [
      { name: 'Corrientazo', price: 18000, hours: '11:30 a 15:00', limit: '60 unidades' },
      { name: 'Bandeja paisa', price: 28000, hours: '12:00 a 16:00' },
    ],
  },
  {
    day: 'Mié',
    date: '21',
    dishes: [
      { name: 'Corrientazo', price: 18000, hours: '11:30 a 15:00', limit: '60 unidades' },
      { name: 'Ajiaco santafereño', price: 24000, limit: '40 unidades' },
    ],
  },
  {
    day: 'Jue',
    date: '22',
    dishes: [
      { name: 'Corrientazo', price: 18000, hours: '11:30 a 15:00', limit: '60 unidades' },
      { name: 'Hamburguesa de la casa', price: 22000, promo: 19000, limit: 'Hasta agotar existencias' },
    ],
  },
  {
    day: 'Vie',
    date: '23',
    dishes: [
      { name: 'Corrientazo', price: 18000, hours: '11:30 a 15:00', limit: '60 unidades' },
      { name: 'Bandeja paisa', price: 28000, hours: '12:00 a 16:00' },
      { name: 'Salchipapa', price: 16000, soldOut: true },
    ],
  },
]

function DishChip({ dish, selected, onSelect }: { dish: PlannedDish; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={clsx(
        'w-full rounded-lg px-2.5 py-2 text-left text-xs leading-snug transition-colors',
        selected ? 'bg-neutral-100 text-neutral-950' : 'bg-neutral-800/70 text-neutral-200 hover:bg-neutral-800',
        dish.soldOut && !selected && 'text-neutral-500 line-through',
      )}
    >
      <span className="block font-medium">{dish.name}</span>
      <span className={clsx('mt-0.5 block tabular-nums', selected ? 'text-neutral-600' : 'text-neutral-400')}>{formatMoney(dish.promo ?? dish.price)}</span>
    </button>
  )
}

/** The rules of the selected dish on its day, as the planner shows them when you tap it. */
function DishRules({ day, dish }: { day: string; dish: PlannedDish }) {
  const rules = [
    { icon: Clock, label: 'Horario', value: dish.hours ?? 'Todo el horario de la cocina' },
    {
      icon: Tag,
      label: 'Precio',
      value: dish.promo ? (
        <>
          {formatMoney(dish.promo)} <span className="text-neutral-500 line-through">{formatMoney(dish.price)}</span> promocional
        </>
      ) : (
        `${formatMoney(dish.price)} (el normal)`
      ),
    },
    { icon: PackageCheck, label: 'Disponibilidad', value: dish.soldOut ? 'Marcado agotado este día' : (dish.limit ?? 'Sin límite') },
  ]
  return (
    <div key={day + dish.name} className="landing-order-swap rounded-xl bg-neutral-950/70 p-4">
      <p className="text-sm font-medium text-neutral-100">
        {dish.name} · {day}
      </p>
      <dl className="mt-3 grid gap-2.5 text-sm sm:grid-cols-3">
        {rules.map(({ icon: Icon, label, value }) => (
          <div key={label}>
            <dt className="flex items-center gap-1.5 text-xs text-neutral-400">
              <Icon size={13} aria-hidden /> {label}
            </dt>
            <dd className={clsx('mt-0.5 tabular-nums', dish.soldOut && label === 'Disponibilidad' ? 'text-amber-400' : 'text-neutral-100')}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * Menu planning (ADR 0068): a band of its own, between the app's screens and the rest of the day. The week as
 * the planner shows it; tapping a dish in a day shows its rules there. On a phone, one day at a time.
 */
export function MenuPlannerSection() {
  const [pick, setPick] = useState({ day: 3, dish: 1 })
  const day = WEEK[pick.day]
  const dish = day.dishes[pick.dish] ?? day.dishes[0]
  const select = (d: number, i: number) => setPick({ day: d, dish: i })

  return (
    <section id="planificador" className="scroll-mt-24 bg-[var(--l-field)] px-[var(--l-margin)] py-[clamp(80px,9vw,140px)]" aria-labelledby="landing-planner">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-4">
          <h2 id="landing-planner" data-reveal className="landing-display max-w-[16ch] text-[length:var(--l-size-title)]">
            Planea el menú de toda la semana
          </h2>
          <div data-reveal style={{ '--i': 1 } as CSSProperties} className="mt-5 max-w-[42ch] space-y-4">
            <p>Arrastra tus platos a cada día del calendario. En cada día, un plato puede tener su horario, un precio promocional o un límite de unidades, o quedar agotado.</p>
            <p>Copia una semana o un día completo en un clic. El menú de hoy es el que ven tus clientes en tu menú web.</p>
            <p className="text-[length:var(--l-size-small)] text-[var(--l-soft)]">
              En los platos defines lo que el cliente elige (la sopa, la proteína, los acompañantes) y, desde el plan Business, compartes platos con su receta entre tus cuentas.
            </p>
          </div>
        </div>

        {/* The planner itself, in the app's dark theme. */}
        <div data-reveal style={{ '--i': 2 } as CSSProperties} className="lg:col-span-8">
          <div data-ui className="rounded-[var(--l-radius)] bg-neutral-900 p-4 text-neutral-100 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-base font-semibold">Semana del 19 al 23 de octubre</p>
              <span className="inline-flex items-center gap-1.5 text-sm text-neutral-400">
                <Copy size={14} aria-hidden /> Copiar semana o día
              </span>
            </div>

            {/* Phones: one day at a time. */}
            <div role="group" aria-label="Día" className="mt-4 grid grid-cols-5 gap-1 md:hidden">
              {WEEK.map((d, i) => (
                <button
                  key={d.day}
                  type="button"
                  aria-pressed={i === pick.day}
                  onClick={() => select(i, 0)}
                  className={clsx('rounded-lg py-2 text-sm font-medium transition-colors', i === pick.day ? 'bg-neutral-100 text-neutral-950' : 'bg-neutral-800/70 text-neutral-300')}
                >
                  {d.day}
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-1.5 md:hidden">
              {day.dishes.map((d, i) => (
                <DishChip key={d.name} dish={d} selected={i === pick.dish} onSelect={() => select(pick.day, i)} />
              ))}
            </div>

            {/* Wider screens: the whole week. */}
            <div className="mt-5 hidden grid-cols-5 gap-2 md:grid">
              {WEEK.map((d, di) => (
                <div key={d.day} className={clsx('rounded-xl p-2 transition-colors', di === pick.day ? 'bg-neutral-800/60' : 'bg-neutral-950/40')}>
                  <p className="px-1 pb-2 text-xs text-neutral-400">
                    <span className={clsx('font-semibold', di === pick.day ? 'text-brasa-400' : 'text-neutral-200')}>{d.day}</span> {d.date}
                  </p>
                  <div className="space-y-1.5">
                    {d.dishes.map((dish, i) => (
                      <DishChip key={dish.name} dish={dish} selected={di === pick.day && i === pick.dish} onSelect={() => select(di, i)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <DishRules day={`${day.day} ${day.date}`} dish={dish} />
            </div>
          </div>
          <p className="mt-3 text-[length:var(--l-size-small)] text-[var(--l-soft)]">Una semana de ejemplo. Toca un plato para ver sus reglas de ese día.</p>
        </div>
      </div>
    </section>
  )
}
