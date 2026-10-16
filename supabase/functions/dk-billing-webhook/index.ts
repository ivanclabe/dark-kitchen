// Wompi events (ADR 0066). Wompi calls without a Supabase session: what makes the
// event trustworthy is its checksum with the events secret (X-Event-Checksum).
//
//   * Every event is recorded as it arrived (dk_billing_events), valid or not.
//   * The same event twice (same checksum) is answered OK and not processed again.
//   * Only a valid `transaction.updated` is applied, and the database applies it only
//     when the reference, amount and currency match the invoice.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { verifyEvent, type WompiEvent } from '../_shared/wompi.ts'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 })
  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  let event: WompiEvent
  try {
    event = await req.json()
  } catch {
    return new Response('Cuerpo inválido', { status: 400 })
  }

  const { valid, checksum } = await verifyEvent(event, Deno.env.get('WOMPI_EVENTS_SECRET') ?? '', req.headers.get('X-Event-Checksum'))
  const tx = event.data?.transaction
  const { data: isNew, error } = await service.rpc('dk_billing_record_event', {
    p_checksum: valid ? checksum : `invalida:${crypto.randomUUID()}`,
    p_event_type: event.event ?? null,
    p_environment: event.environment ?? null,
    p_transaction_id: tx?.id ?? null,
    p_reference: tx?.reference ?? null,
    p_transaction_status: tx?.status ?? null,
    p_signature_valid: valid,
    p_payload: event as unknown as Record<string, unknown>,
  })
  if (error) {
    console.error('dk-billing-webhook record', error)
    return new Response('Error', { status: 500 })
  }
  if (!valid) return new Response('Firma inválida', { status: 401 })
  if (!isNew) return new Response('Ya procesado', { status: 200 })

  let result = 'ignored'
  if (event.event === 'transaction.updated' && tx) {
    const applied = await service.rpc('dk_billing_apply_transaction', {
      p_reference: tx.reference,
      p_transaction_id: tx.id,
      p_status: tx.status,
      p_amount_in_cents: tx.amount_in_cents,
      p_currency: tx.currency,
      p_method: tx.payment_method_type ?? null,
      p_message: tx.status_message ?? null,
    })
    if (applied.error) {
      console.error('dk-billing-webhook apply', applied.error)
      // Wompi retries a non-200: the event stays recorded without a result until then.
      return new Response('Error', { status: 500 })
    }
    result = (applied.data as { result: string }).result
  }
  await service.rpc('dk_billing_finish_event', { p_checksum: checksum, p_result: result })
  return new Response('OK', { status: 200 })
})
