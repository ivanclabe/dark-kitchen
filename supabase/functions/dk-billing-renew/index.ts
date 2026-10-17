// Renewals with the saved card (ADR 0066 §5). pg_cron runs dk_billing_daily() every
// morning: it moves the states in SQL and then wakes this function, which charges what
// is due. Wompi does not schedule recurring charges: Quanela does.
//
//   * The database hands out each charge with its attempt already recorded
//     (dk_billing_charges_due), so a second call — or a stranger calling this
//     public address — never charges twice nor earlier than due.
//   * The result is applied like any other payment; the signed event confirms it later.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { chargeSource, settle, wompiConfig } from '../_shared/wompiApi.ts'

interface Due {
  reference: string
  amountInCents: number
  currency: string
  sourceId: string
  email: string | null
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 })
  const cfg = wompiConfig()
  if (!cfg) return Response.json({ charged: 0, skipped: 'not_configured' })
  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const { data, error } = await service.rpc('dk_billing_charges_due')
  if (error) {
    console.error('dk-billing-renew due', error)
    return new Response('Error', { status: 500 })
  }
  const results: { reference: string; status: string }[] = []
  for (const due of (data ?? []) as Due[]) {
    try {
      if (!due.email) throw new Error('Sin correo del cliente')
      const tx = await settle(cfg, await chargeSource(cfg, { sourceId: due.sourceId, reference: due.reference, amountInCents: due.amountInCents, currency: due.currency, email: due.email }), 5000)
      await service.rpc('dk_billing_apply_transaction', {
        p_reference: tx.reference,
        p_transaction_id: tx.id,
        p_status: tx.status,
        p_amount_in_cents: tx.amount_in_cents,
        p_currency: tx.currency,
        p_method: tx.payment_method_type ?? null,
        p_message: tx.status_message ?? null,
      })
      results.push({ reference: due.reference, status: tx.status })
    } catch (err) {
      // A charge that never reached Wompi: the attempt is marked as an error (the next one is already scheduled).
      await service.rpc('dk_billing_apply_transaction', {
        p_reference: due.reference,
        p_transaction_id: null,
        p_status: 'ERROR',
        p_amount_in_cents: due.amountInCents,
        p_currency: due.currency,
        p_method: 'CARD',
        p_message: String(err).slice(0, 300),
      })
      results.push({ reference: due.reference, status: 'ERROR' })
    }
  }
  return Response.json({ charged: results.length, results })
})
