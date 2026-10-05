import type { Can } from '@/shared/rbac/roles'

interface Suggestion {
  text: string
  /** Shown only with this permission (each answer is limited the same way in the database). */
  needs: Parameters<Can>[0]
  /** Sections where it goes first. */
  screens: string[]
}

const SUGGESTIONS: Suggestion[] = [
  { text: '¿Cuánto vendimos esta semana frente a la pasada?', needs: 'reports.view', screens: ['/dashboard', '/insights'] },
  { text: '¿Cuáles son los 5 platos más vendidos del mes?', needs: 'reports.view', screens: ['/insights', '/menu-planner'] },
  { text: '¿A qué hora vendemos más?', needs: 'reports.view', screens: ['/insights'] },
  { text: '¿Qué pedidos de hoy se demoraron más de 30 minutos?', needs: 'orders.view', screens: ['/orders'] },
  { text: '¿Cómo van los tiempos de cocina esta semana?', needs: 'kitchen.view', screens: ['/kitchen'] },
  { text: '¿Qué insumos están por agotarse?', needs: 'inventory.view', screens: ['/supply', '/kitchen'] },
  { text: '¿Qué platos llevan pollo y cuánto pollo queda?', needs: 'products.view', screens: ['/menu-planner', '/recipes', '/supply'] },
  { text: '¿Quiénes son los clientes que más compran este mes?', needs: 'customers.view', screens: ['/customers'] },
  { text: '¿Qué clientes tienen saldo pendiente?', needs: 'receivables.view', screens: ['/customers'] },
  { text: '¿Cuánto gastamos en compras este mes y con qué proveedor?', needs: 'purchasing.view', screens: ['/supply'] },
  { text: '¿Cómo van las entregas por domiciliario esta semana?', needs: 'dispatch.view', screens: ['/orders'] },
  { text: '¿Quién está de turno ahora?', needs: 'staff.view', screens: ['/staff', '/orders'] },
  { text: '¿Cuándo es mi próximo turno?', needs: 'copilot.use', screens: ['/my-shifts'] },
]

/** Up to `max` questions this person can ask, the ones about the current screen first. */
export function suggestionsFor(can: Can, section: string, max = 4): string[] {
  const allowed = SUGGESTIONS.filter((s) => can(s.needs))
  const here = (s: Suggestion) => s.screens.some((p) => section === p || section.startsWith(`${p}/`))
  return [...allowed.filter(here), ...allowed.filter((s) => !here(s))].slice(0, max).map((s) => s.text)
}
