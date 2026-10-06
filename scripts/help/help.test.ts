// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildHelp, renderOutputs } from './lib'
import { KB } from '../../supabase/functions/_shared/kb'
import { searchKb } from '../../supabase/functions/_shared/kbSearch'

const ROOT = join(__dirname, '../..')

describe('help center content (ADR 0034)', () => {
  const build = buildHelp(ROOT)

  it('has no errors: metadata, links between articles, screenshots', () => {
    expect(build.errors).toEqual([])
  })

  it('the generated files are up to date (run «npm run help» after editing content/help)', () => {
    for (const [file, text] of Object.entries(renderOutputs(build))) {
      expect(readFileSync(join(ROOT, file), 'utf8'), file).toBe(text)
    }
  })

  it('every article has the questions «Oye Quanela» answers with it', () => {
    for (const a of build.kb) expect(a.questions.length, a.id).toBeGreaterThan(0)
  })
})

/**
 * How people actually ask (paraphrased, not copied from the articles), with
 * the article that should come first. Goal: top-1 ≥ 85 %, top-3 ≥ 95 %.
 */
const EVAL: [string, string][] = [
  ['como hago un pedido nuevo', 'create-order'],
  ['donde registro que el cliente me pago', 'register-payment'],
  ['el cliente pagó con transferencia, cómo lo anoto', 'register-payment'],
  ['quiero anular un pedido', 'confirm-cancel'],
  ['no me deja confirmar el pedido', 'confirm-cancel'],
  ['qué significa cada estado de un pedido', 'order-states'],
  ['cómo mando un pedido con el domiciliario', 'dispatch-deliver'],
  ['buscar un pedido de la semana pasada', 'search-orders'],
  ['cómo funciona la pantalla de cocina', 'kitchen-view'],
  ['por qué un pedido sale en rojo como atrasado', 'kitchen-times'],
  ['decir pedido listo con la voz', 'kitchen-voice'],
  ['cambiar el horario de atención de la cocina', 'kitchen-hours'],
  ['qué insumos me hacen falta', 'stock'],
  ['crear un ingrediente nuevo', 'stock'],
  ['cargar la factura del proveedor', 'purchases'],
  ['agregar un proveedor nuevo', 'suppliers'],
  ['se me dañó la leche, cómo la saco del inventario', 'waste-adjustments'],
  ['el conteo físico no cuadra con el sistema', 'waste-adjustments'],
  ['en qué momento baja el inventario', 'inventory-deduction'],
  ['crear un plato con su precio', 'dishes-and-menu'],
  ['poner una hamburguesa en promoción el viernes', 'dishes-and-menu'],
  ['cuánto me cuesta hacer una pizza', 'recipes-and-cost'],
  ['agregar ingredientes a la receta', 'recipes-and-cost'],
  ['quiénes me deben plata', 'customers'],
  ['registrar un abono de un cliente', 'customers'],
  ['cuánto vendimos este mes', 'insights'],
  ['exportar las ventas a excel', 'insights'],
  ['cuál plato me deja más ganancia', 'product-profitability'],
  ['cuánto perdí en mermas', 'costs-and-purchases'],
  ['agregar un empleado nuevo', 'invite-team'],
  ['cambiarle el rol a un empleado', 'users-and-roles'],
  ['quitarle el acceso a alguien que ya no trabaja', 'users-and-roles'],
  ['programar los turnos de la semana', 'shifts'],
  ['marcar mi hora de entrada', 'shifts'],
  ['qué le puedo preguntar a copilot', 'ask-copilot'],
  ['activar el manos libres', 'oye-quanela'],
  ['copilot dice que llegué al límite', 'copilot-limits'],
  ['cambiar la zona horaria de la cuenta', 'settings'],
  ['cómo registro mi negocio en quanela', 'create-business'],
  ['qué hay de nuevo en la app', 'release-notes'],
]

describe('help search (the knowledge base of «Oye Quanela»)', () => {
  const ranks = EVAL.map(([q, id]) => ({ q, id, got: searchKb(q, KB, { limit: 3 }).map((h) => h.article.id) }))

  it('finds the right article first for most questions (top-1 ≥ 85 %)', () => {
    const misses = ranks.filter((r) => r.got[0] !== r.id)
    expect(1 - misses.length / ranks.length, JSON.stringify(misses, null, 1)).toBeGreaterThanOrEqual(0.85)
  })

  it('has it among the first three for almost all (top-3 ≥ 95 %)', () => {
    const misses = ranks.filter((r) => !r.got.includes(r.id))
    expect(1 - misses.length / ranks.length, JSON.stringify(misses, null, 1)).toBeGreaterThanOrEqual(0.95)
  })
})
