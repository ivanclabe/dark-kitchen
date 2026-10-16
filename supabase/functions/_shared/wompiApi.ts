// Wompi's API from the server (ADR 0066). The private key never leaves the edge functions.
import { integritySignature, wompiApiUrl, type WompiEnv, type WompiTransaction } from './wompi.ts'

export interface WompiConfig {
  env: WompiEnv
  /** Wompi's API; WOMPI_API_URL only replaces it in local tests (a simulated Wompi). */
  apiUrl: string
  publicKey: string
  privateKey: string
  integritySecret: string
  eventsSecret: string
}

/** The keys from the function secrets; null when payments are not configured yet. */
export function wompiConfig(): WompiConfig | null {
  const publicKey = Deno.env.get('WOMPI_PUBLIC_KEY') ?? ''
  const privateKey = Deno.env.get('WOMPI_PRIVATE_KEY') ?? ''
  const integritySecret = Deno.env.get('WOMPI_INTEGRITY_SECRET') ?? ''
  const eventsSecret = Deno.env.get('WOMPI_EVENTS_SECRET') ?? ''
  if (!publicKey || !privateKey || !integritySecret) return null
  const env: WompiEnv = Deno.env.get('WOMPI_ENV') === 'production' ? 'production' : 'sandbox'
  // A production key in sandbox (or the other way round) charges where nobody looks.
  if ((env === 'production') !== publicKey.startsWith('pub_prod_')) return null
  return { env, apiUrl: Deno.env.get('WOMPI_API_URL') || wompiApiUrl(env), publicKey, privateKey, integritySecret, eventsSecret }
}

async function call<T>(cfg: WompiConfig, path: string, init: RequestInit & { key: 'public' | 'private' }): Promise<T> {
  const res = await fetch(`${cfg.apiUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${init.key === 'private' ? cfg.privateKey : cfg.publicKey}` },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const reason = body?.error?.messages ? JSON.stringify(body.error.messages) : (body?.error?.reason ?? res.statusText)
    throw new Error(`Wompi ${res.status}: ${reason}`)
  }
  return body as T
}

export interface Acceptance {
  privacy: { token: string; permalink: string }
  personalData: { token: string; permalink: string }
}

/** The two acceptance tokens Colombian law asks for (privacy policy and personal data). */
export async function acceptanceTokens(cfg: WompiConfig): Promise<Acceptance> {
  const { data } = await call<{ data: Record<string, { acceptance_token: string; permalink: string }> }>(cfg, `/merchants/${cfg.publicKey}`, {
    method: 'GET',
    key: 'public',
  })
  return {
    privacy: { token: data.presigned_acceptance.acceptance_token, permalink: data.presigned_acceptance.permalink },
    personalData: { token: data.presigned_personal_data_auth.acceptance_token, permalink: data.presigned_personal_data_auth.permalink },
  }
}

/** A reusable card from a card token made in the browser. */
export async function createCardSource(cfg: WompiConfig, input: { token: string; email: string; acceptanceToken: string; personalAuthToken: string }) {
  const { data } = await call<{ data: { id: number; status: string; public_data?: { type?: string } } }>(cfg, '/payment_sources', {
    method: 'POST',
    key: 'private',
    body: JSON.stringify({
      type: 'CARD',
      token: input.token,
      customer_email: input.email,
      acceptance_token: input.acceptanceToken,
      accept_personal_auth: input.personalAuthToken,
    }),
  })
  return data
}

export async function cardTokenInfo(cfg: WompiConfig, token: string): Promise<{ brand: string | null; lastFour: string | null }> {
  try {
    const { data } = await call<{ data: { brand?: string; last_four?: string } }>(cfg, `/tokens/cards/${token}`, { method: 'GET', key: 'public' })
    return { brand: data.brand ?? null, lastFour: data.last_four ?? null }
  } catch {
    return { brand: null, lastFour: null }
  }
}

/** Charge a saved card. The amount and the reference come from the database, never from the browser. */
export async function chargeSource(
  cfg: WompiConfig,
  input: { sourceId: string | number; reference: string; amountInCents: number; currency: string; email: string },
): Promise<WompiTransaction> {
  const signature = await integritySignature(input.reference, input.amountInCents, input.currency, cfg.integritySecret)
  const { data } = await call<{ data: WompiTransaction }>(cfg, '/transactions', {
    method: 'POST',
    key: 'private',
    body: JSON.stringify({
      amount_in_cents: input.amountInCents,
      currency: input.currency,
      signature,
      customer_email: input.email,
      reference: input.reference,
      payment_source_id: Number(input.sourceId),
      payment_method: { installments: 1 },
      recurrent: true,
    }),
  })
  return data
}

export async function getTransaction(cfg: WompiConfig, id: string): Promise<WompiTransaction> {
  const { data } = await call<{ data: WompiTransaction }>(cfg, `/transactions/${encodeURIComponent(id)}`, { method: 'GET', key: 'private' })
  return data
}

/** A card charge usually settles in seconds: wait a little for the final status (the event arrives anyway). */
export async function settle(cfg: WompiConfig, tx: WompiTransaction, waitMs = 8000): Promise<WompiTransaction> {
  let current = tx
  const until = Date.now() + waitMs
  while (current.status === 'PENDING' && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1500))
    current = await getTransaction(cfg, current.id).catch(() => current)
  }
  return current
}
