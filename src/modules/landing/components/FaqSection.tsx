import { ChevronDown } from 'lucide-react'
import { display } from '../lib/typography'

/** Solo lo que es cierto hoy en el producto (ADR 0010). */
const FAQ: { q: string; a: string }[] = [
  {
    q: '¿Necesito tarjeta para empezar?',
    a: 'No. Standard y Business empiezan con una prueba gratis. Eliges el plan al crear tu cuenta y entras a trabajar de inmediato.',
  },
  {
    q: '¿Qué es una cuenta?',
    a: 'Un establecimiento completo: su cocina, pedidos, clientes, menú e inventario. Si tienes varios locales, cada uno es una cuenta y todas quedan en tu mismo espacio.',
  },
  {
    q: '¿Puedo cambiar de plan después?',
    a: 'Sí. Escríbenos y lo ajustamos. Al cambiar no se pierde nada: si bajas de plan, tus datos se conservan y solo se limita lo que el nuevo plan no incluye.',
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

export function FaqSection() {
  return (
    <section id="faq" className="theme-light scroll-mt-16 bg-white text-neutral-50" aria-labelledby="landing-faq">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-24">
        <h2 id="landing-faq" style={display} className="text-3xl font-black tracking-[-0.02em] text-[#1C1310] sm:text-5xl">
          Preguntas frecuentes
        </h2>
        <div className="mt-10 divide-y divide-[#1C1310]/10 border-y border-[#1C1310]/10">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium text-[#1C1310] [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown size={18} className="shrink-0 text-brasa-600 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="mt-3 text-[15px] leading-relaxed text-[#5B4A42]">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
