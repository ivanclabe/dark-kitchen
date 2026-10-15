/**
 * What Quanela does, as tips (each one exists in the app). `short` fits one line of the loading screen (8-10
 * words); `long` is the «Consejo del día» on Inicio, with its guide in the help center.
 */
export interface Tip {
  id: string
  short: string
  long: string
  /** The guide that explains it (help center path). */
  help: string
}

export const TIPS: readonly Tip[] = [
  {
    id: 'copilot',
    short: 'Pregúntale a Copilot: ¿cuánto vendimos esta semana?',
    long: 'Copilot responde con los datos de tu negocio. Pregúntale «¿Cuánto vendimos esta semana?» o «¿Qué pedidos de hoy se demoraron más?».',
    help: '/help/assistant/ask-copilot',
  },
  {
    id: 'invoice',
    short: 'Sube la foto de una factura y Quanela la registra.',
    long: 'Sube la foto o el PDF de una factura de compra: Quanela la lee y la deja lista para que solo la revises y la confirmes.',
    help: '/help/inventory/invoice-import',
  },
  {
    id: 'composition',
    short: 'Tus platos pueden tener opciones para elegir.',
    long: 'Un plato puede tener opciones: sopa, proteína y bebida a elegir, con extras que suman al precio y descuentan su inventario.',
    help: '/help/catalog/dish-composition',
  },
  {
    id: 'preparations',
    short: 'Prepara salsas por lote y úsalas en tus recetas.',
    long: 'Registra preparaciones como salsas o bases: se hacen por lote, tienen su propio stock y se usan en tus recetas sin repetir su costo.',
    help: '/help/inventory/preparations',
  },
  {
    id: 'voice',
    short: 'Di «Oye Quanela» y pídele cosas con la voz.',
    long: 'Di «Oye Quanela» para pedirle cosas con la voz, sin soltar lo que estás haciendo en la cocina.',
    help: '/help/assistant/oye-quanela',
  },
  {
    id: 'public-menu',
    short: 'Tu menú web envía los pedidos directo a cocina.',
    long: 'Comparte tu menú web por WhatsApp o con su QR: los pedidos llegan directo a la cocina y el cliente sigue su estado.',
    help: '/help/catalog/public-menu',
  },
]

/** The day as YYYY-MM-DD in local time. */
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** One tip per day, the same all day long; the next day, the next one. */
export function tipOfTheDay(date = new Date()): Tip {
  const days = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
  return TIPS[days % TIPS.length]
}
