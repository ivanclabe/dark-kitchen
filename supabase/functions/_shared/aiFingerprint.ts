/**
 * The fingerprint of what an analysis shows the model (ADR 0063). Two analyses with the same fingerprint would
 * get the same answer, so the second one reuses the first instead of calling the model again.
 *
 * Only what changes the answer is part of it: values that move every minute (minutes elapsed) or by tiny
 * amounts (fractions of a gram) are left out or rounded, otherwise the fingerprint would never repeat.
 * Pure (no Deno, no Node APIs besides Web Crypto): it runs in the edge function and in the tests.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** JSON with sorted keys: the same data always gives the same text. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

const whole = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : n ?? null)

/**
 * The part of the kitchen snapshot that matters: which orders, in what state, late or stalled, which dishes in
 * which state. Not the minutes (they change every minute and the flags already say «late»).
 */
export function kitchenProjection(payload: { contexto?: { domiciliarios_activos?: unknown }; pedidos?: Record<string, unknown>[] }): Json {
  const orders = (payload.pedidos ?? []).map((o) => ({
    id: String(o.id),
    estado: (o.estado as string) ?? null,
    prioritario: Boolean(o.prioritario),
    atrasado: Boolean(o.atrasado),
    detenido: Boolean(o.detenido),
    platos: ((o.platos as Record<string, unknown>[]) ?? [])
      .map((p) => ({ plato: (p.plato as string) ?? null, cantidad: whole(p.cantidad) as Json, estado: (p.estado as string) ?? null, detenido: Boolean(p.detenido) }))
      .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
  }))
  orders.sort((a, b) => a.id.localeCompare(b.id))
  return { riders: whole(payload.contexto?.domiciliarios_activos) as Json, orders }
}

/** Supply: the same ingredients with the same figures, rounded to whole units (a few grams do not change advice). */
export function supplyProjection(payload: { insumos?: Record<string, unknown>[] }): Json {
  return (payload.insumos ?? [])
    .map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, (typeof v === 'number' ? whole(v) : v ?? null) as Json])))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** The fingerprint of a feature's payload. */
export function fingerprint(feature: string, payload: unknown): Promise<string> {
  const projection = feature === 'kitchen_insights' ? kitchenProjection(payload as never) : supplyProjection(payload as never)
  return sha256(`${feature}:${stableStringify(projection)}`)
}
