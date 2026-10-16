// Wompi (ADR 0066): the pure parts shared by dk-billing, dk-billing-webhook and
// dk-billing-renew. No network and no secrets here: they are passed in.
//
//   * Integrity signature (checkout and API transactions):
//       SHA-256( reference + amountInCents + currency + integritySecret )
//   * Event checksum (transaction.updated): SHA-256 of the values named in
//     `signature.properties` (paths inside `data`, in that order) + `timestamp`
//     + the events secret. The properties are read from each event, never fixed.

export type WompiEnv = 'sandbox' | 'production'

export function wompiApiUrl(env: WompiEnv): string {
  return env === 'production' ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1'
}

export const WOMPI_CHECKOUT_URL = 'https://checkout.wompi.co/p/'

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function integritySignature(reference: string, amountInCents: number, currency: string, integritySecret: string): Promise<string> {
  return sha256Hex(`${reference}${amountInCents}${currency}${integritySecret}`)
}

/** A value at a dotted path ("transaction.amount_in_cents") inside an object. */
export function valueAt(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined), source)
}

export interface WompiTransaction {
  id: string
  status: string
  reference: string
  amount_in_cents: number
  currency: string
  payment_method_type?: string
  status_message?: string | null
}

export interface WompiEvent {
  event: string
  data: { transaction?: WompiTransaction } & Record<string, unknown>
  environment?: string
  signature?: { properties?: string[]; checksum?: string }
  timestamp?: number
  sent_at?: string
}

/** The checksum Wompi should have sent for this event. */
export async function eventChecksum(event: WompiEvent, eventsSecret: string): Promise<string> {
  const values = (event.signature?.properties ?? []).map((path) => String(valueAt(event.data, path) ?? '')).join('')
  return sha256Hex(`${values}${event.timestamp ?? ''}${eventsSecret}`)
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Is the event Wompi's? The checksum comes in the X-Event-Checksum header and in
 * signature.checksum; both must match what the events secret gives.
 */
export async function verifyEvent(event: WompiEvent, eventsSecret: string, headerChecksum: string | null): Promise<{ valid: boolean; checksum: string }> {
  const received = (headerChecksum ?? event.signature?.checksum ?? '').toLowerCase()
  if (!received || !eventsSecret || !event.signature?.properties?.length || event.timestamp === undefined) return { valid: false, checksum: received || 'sin-firma' }
  const expected = await eventChecksum(event, eventsSecret)
  const bodyChecksum = (event.signature.checksum ?? received).toLowerCase()
  return { valid: sameText(received, expected) && sameText(bodyChecksum, expected), checksum: received }
}

/** Web Checkout: Wompi's page with every method (card, PSE, Nequi, Bancolombia). */
export function checkoutUrl(input: {
  /** Only local tests replace Wompi's page (WOMPI_CHECKOUT_URL). */
  base?: string
  publicKey: string
  currency: string
  amountInCents: number
  reference: string
  signature: string
  redirectUrl: string
  email?: string | null
}): string {
  const params = new URLSearchParams({
    'public-key': input.publicKey,
    currency: input.currency,
    'amount-in-cents': String(input.amountInCents),
    reference: input.reference,
    'signature:integrity': input.signature,
    'redirect-url': input.redirectUrl,
  })
  if (input.email) params.set('customer-data:email', input.email)
  return `${input.base ?? WOMPI_CHECKOUT_URL}?${params.toString()}`
}

/** Only the app's own addresses may be the return of a checkout. */
export function isAllowedReturnUrl(url: string, allowedHosts: string[]): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (u.protocol === 'http:' && (host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1')) return true
    if (u.protocol !== 'https:') return false
    return allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}

/** "Visa •••• 4242" for the screen; the card itself stays in Wompi. */
export function cardLabel(brand: string | null | undefined, lastFour: string | null | undefined): string {
  const name = (brand ?? 'Tarjeta').toString()
  const pretty = name.length <= 4 ? name.toUpperCase() : name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
  return lastFour ? `${pretty} •••• ${lastFour}` : pretty
}
