import type { CSSProperties } from 'react'

/** Solo lo que es cierto hoy en el producto (ADR 0010). */
const FAQ: { q: string; a: string }[] = [
  {
    q: '¿Cómo pago mi plan?',
    a: 'En línea, al terminar de crear tu cuenta: con tarjeta, PSE, Nequi o el botón Bancolombia, a través de Wompi. Con tarjeta se renueva sola; con los otros medios te avisamos antes de cada renovación. Pagando el año te regalamos dos meses.',
  },
  {
    q: '¿Qué es una cuenta?',
    a: 'Un establecimiento completo: su cocina, pedidos, clientes, menú e inventario. Si tienes varios locales, cada uno es una cuenta y todas quedan en tu mismo espacio.',
  },
  {
    q: '¿Puedo cambiar de plan después?',
    a: 'Sí, desde Facturación. Si subes de plan, pagas solo la diferencia hasta tu renovación; si bajas, el cambio se aplica al renovar. Tus datos se conservan siempre.',
  },
  {
    q: '¿Puedo cancelar?',
    a: 'Sí, cuando quieras, desde Facturación. No hay permanencia: sigues usando Quanela hasta el final del período que pagaste y no se vuelve a cobrar.',
  },
  {
    q: '¿Qué pasa si llego al límite de mi plan?',
    a: 'Todo sigue funcionando. Solo no podrás crear más cuentas o usuarios que los que incluye tu plan hasta que cambies a uno mayor.',
  },
  {
    q: '¿Cada local ve la información de los otros?',
    a: 'No. Los pedidos, clientes, menú e inventario de cada cuenta están separados, y cada persona solo entra a las cuentas que le asignes, con el rol que le des.',
  },
  {
    q: '¿Para qué sirve la inteligencia artificial?',
    a: 'Te sugiere qué comprar, avisa de perecederos en riesgo y de insumos sin movimiento, y en Cocina propone qué priorizar. Siempre recomienda; las decisiones las tomas tú.',
  },
]

/** Questions and answers as reading text, like the notes at the back of a programme: all answered at a glance. */
export function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-16 px-[var(--l-margin)] pb-[clamp(96px,12vw,180px)]" aria-labelledby="landing-faq">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-6">
        <h2 id="landing-faq" data-reveal className="landing-display text-[length:var(--l-size-title)] lg:col-span-3">
          Preguntas frecuentes
        </h2>
        <div className="lg:col-span-8 lg:col-start-5 lg:columns-2 lg:gap-14">
          {FAQ.map(({ q, a }, i) => (
            <p key={q} data-reveal style={{ '--i': i % 3 } as CSSProperties} className="mb-5 break-inside-avoid leading-[1.55]">
              <strong className="font-semibold">{q}</strong> {a}
            </p>
          ))}
        </div>
      </div>
    </section>
  )
}
