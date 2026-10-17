// Quanela subscriptions (ADR 0066): checkout, saved card and payment status.
//
//   * Who can pay is decided by the database, as the caller (their JWT):
//     dk_billing_checkout_start / dk_billing_manager_email require billing.manage.
//   * What to charge (amount, plan, reference) comes from the database, never from
//     the browser. The private key and the integrity secret never leave this function.
//   * A payment is applied only from Wompi's own data (the transaction read from
//     Wompi here, or the signed event in dk-billing-webhook), through the service role.
//   * The card number never reaches Quanela: the browser tokenizes it with Wompi's
//     public key and sends only the token.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cardLabel, checkoutUrl, integritySignature, isAllowedReturnUrl } from '../_shared/wompi.ts'
import { acceptanceTokens, cardTokenInfo, chargeSource, createCardSource, getTransaction, settle, wompiConfig, type WompiConfig } from '../_shared/wompiApi.ts'
import type { WompiTransaction } from '../_shared/wompi.ts'

const RETURN_HOSTS = (Deno.env.get('BILLING_RETURN_HOSTS') ?? 'quanela.com').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Body =
  | { action: 'config'; organizationId: string }
  | { action: 'checkout'; organizationId: string; planKey?: string; billingPeriod?: string; redirectUrl: string; email?: string }
  | {
      action: 'pay_with_card'
      organizationId: string
      planKey?: string
      billingPeriod?: string
      cardToken: string
      acceptanceToken: string
      personalAuthToken: string
      email?: string
    }
  | { action: 'status'; transactionId: string }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })

function dbError(error: { message: string; code?: string }) {
  return json({ error: error.message, code: error.code }, error.code === '42501' ? 403 : 400)
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Inicia sesión' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Solicitud inválida' }, 400)
  }

  const cfg = wompiConfig()
  if (!cfg) return json({ error: 'Los pagos en línea todavía no están configurados. Escríbenos y te ayudamos.', code: 'PAYMENTS_NOT_CONFIGURED' }, 503)

  async function apply(tx: WompiTransaction) {
    const { data, error } = await service.rpc('dk_billing_apply_transaction', {
      p_reference: tx.reference,
      p_transaction_id: tx.id,
      p_status: tx.status,
      p_amount_in_cents: tx.amount_in_cents,
      p_currency: tx.currency,
      p_method: tx.payment_method_type ?? null,
      p_message: tx.status_message ?? null,
    })
    if (error) throw new Error(error.message)
    return data as { result: string }
  }

  try {
    if (body.action === 'config') {
      // Who can pay sees the keys to tokenize and the texts to accept.
      const { error } = await asCaller.rpc('dk_billing_manager_email', { p_organization_id: body.organizationId })
      if (error) return dbError(error)
      return json({ env: cfg.env, apiUrl: Deno.env.get('WOMPI_BROWSER_API_URL') || cfg.apiUrl, publicKey: cfg.publicKey, acceptance: await acceptanceTokens(cfg) })
    }

    if (body.action === 'status') {
      // The return of the checkout: what Wompi says (never the address bar).
      if (!body.transactionId) return json({ error: 'Falta la transacción' }, 400)
      const tx = await getTransaction(cfg, body.transactionId)
      const result = await apply(tx)
      return json({ status: tx.status, result: result.result })
    }

    if (body.action === 'checkout') {
      if (!isAllowedReturnUrl(body.redirectUrl, RETURN_HOSTS)) return json({ error: 'Dirección de regreso no válida' }, 400)
      const { data, error } = await asCaller.rpc('dk_billing_checkout_start', {
        p_organization_id: body.organizationId,
        p_plan_key: body.planKey ?? null,
        p_billing_period: body.billingPeriod ?? null,
      })
      if (error) return dbError(error)
      const start = data as { applied: boolean; reference: string; amountInCents: number; currency: string; customerEmail: string | null }
      if (start.applied) return json({ applied: true })
      const email = body.email && EMAIL.test(body.email) ? body.email : start.customerEmail
      const signature = await integritySignature(start.reference, start.amountInCents, start.currency, cfg.integritySecret)
      return json({
        applied: false,
        ...start,
        url: checkoutUrl({ base: Deno.env.get('WOMPI_CHECKOUT_URL') || undefined, publicKey: cfg.publicKey, currency: start.currency, amountInCents: start.amountInCents, reference: start.reference, signature, redirectUrl: body.redirectUrl, email }),
      })
    }

    if (body.action === 'pay_with_card') {
      return await payWithCard(cfg, body)
    }
    return json({ error: 'Acción desconocida' }, 400)
  } catch (err) {
    console.error('dk-billing', err)
    return json({ error: 'No pudimos hablar con la pasarela de pagos. Inténtalo de nuevo en unos minutos.' }, 502)
  }

  // Save the card for renewals and, if something is due, charge it now.
  async function payWithCard(cfg: WompiConfig, b: Extract<Body, { action: 'pay_with_card' }>) {
    const { data: knownEmail, error } = await asCaller.rpc('dk_billing_manager_email', { p_organization_id: b.organizationId })
    if (error) return dbError(error)
    const email = b.email && EMAIL.test(b.email) ? b.email.toLowerCase() : (knownEmail as string | null)
    if (!email) return json({ error: 'Escribe el correo para los comprobantes de pago' }, 400)
    if (!b.cardToken || !b.acceptanceToken || !b.personalAuthToken) return json({ error: 'Acepta los términos para guardar la tarjeta' }, 400)

    const source = await createCardSource(cfg, { token: b.cardToken, email, acceptanceToken: b.acceptanceToken, personalAuthToken: b.personalAuthToken })
    if (source.status !== 'AVAILABLE') return json({ error: 'Wompi no aprobó la tarjeta. Revisa los datos o usa otra.' }, 400)
    const info = await cardTokenInfo(cfg, b.cardToken)
    const saved = await service.rpc('dk_billing_save_source', {
      p_organization_id: b.organizationId,
      p_source_id: String(source.id),
      p_label: cardLabel(info.brand, info.lastFour),
      p_email: email,
    })
    if (saved.error) throw new Error(saved.error.message)

    const { data, error: startError } = await asCaller.rpc('dk_billing_checkout_start', {
      p_organization_id: b.organizationId,
      p_plan_key: b.planKey ?? null,
      p_billing_period: b.billingPeriod ?? null,
    })
    if (startError) {
      // Up to date: the card is saved for the next renewal, nothing to charge now.
      if (startError.message.startsWith('ALREADY_CURRENT')) return json({ saved: true, charged: false })
      return dbError(startError)
    }
    const start = data as { applied: boolean; reference: string; amountInCents: number; currency: string }
    if (start.applied) return json({ saved: true, charged: false, applied: true })

    const tx = await settle(cfg, await chargeSource(cfg, { sourceId: source.id, reference: start.reference, amountInCents: start.amountInCents, currency: start.currency, email }))
    const result = await apply(tx)
    const declined = tx.status === 'DECLINED' || tx.status === 'ERROR' || tx.status === 'VOIDED'
    // A card that does not pay now is not kept to renew later.
    if (declined) await service.rpc('dk_billing_forget_source', { p_organization_id: b.organizationId, p_source_id: String(source.id) })
    return json({ saved: !declined, charged: true, status: tx.status, result: result.result, message: tx.status_message ?? null })
  }
})
