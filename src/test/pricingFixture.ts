import type { Plan, PublicPricing } from '@/shared/plans/plans'

/** Planes de prueba (mismos valores que las semillas de ADR 0010) para pruebas de componentes. */
const base = {
  currency: 'COP',
  priceYearly: null,
  highlights: ['Viñeta de prueba'],
  contactUrl: null,
} satisfies Partial<Plan>

export const PRICING: PublicPricing = {
  plans: [
    {
      ...base,
      key: 'standard',
      name: 'Standard',
      description: 'Un establecimiento',
      badge: null,
      priceMonthly: 49900,
      trialDays: 14,
      limits: { accounts: 1, users: 5 },
      cta: 'signup',
      ctaLabel: 'Comenzar gratis',
      selfServe: true,
      sortOrder: 10,
      features: ['voice_commands', 'voice_speech', 'kitchen_stall_alerts'],
    },
    {
      ...base,
      key: 'business',
      name: 'Business',
      description: 'Varios establecimientos',
      badge: 'Más popular',
      priceMonthly: 99900,
      trialDays: 14,
      limits: { accounts: 3, users: 15 },
      cta: 'signup',
      ctaLabel: 'Comenzar gratis',
      selfServe: true,
      sortOrder: 20,
      features: ['voice_commands', 'voice_speech', 'kitchen_stall_alerts', 'supply_reorder'],
    },
    {
      ...base,
      key: 'enterprise',
      name: 'Enterprise',
      description: 'Grupos y cadenas',
      badge: null,
      priceMonthly: 249900,
      trialDays: 0,
      limits: { accounts: null, users: null },
      cta: 'contact_sales',
      ctaLabel: 'Hablar con ventas',
      contactUrl: 'mailto:ventas@darkkitchen.co',
      selfServe: false,
      sortOrder: 30,
      features: ['voice_commands', 'voice_speech', 'kitchen_stall_alerts', 'supply_reorder'],
    },
  ],
  features: [
    { key: 'supply_reorder', category: 'ai', label: 'Sugerencias de compra', sortOrder: 10 },
    { key: 'kitchen_stall_alerts', category: 'ai', label: 'Alertas de pedidos detenidos', sortOrder: 40 },
    { key: 'voice_commands', category: 'voice', label: 'Comandos de voz', sortOrder: 100 },
    { key: 'voice_speech', category: 'voice', label: 'Voz de la aplicación', sortOrder: 110 },
  ],
}
