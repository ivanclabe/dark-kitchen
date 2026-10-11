import { describe, expect, it } from 'vitest'
import {
  cleanParam,
  errorHint,
  graphBase,
  parseWebhook,
  sendOutcome,
  signBody,
  templateCreateRequest,
  templateMessage,
  textMessage,
  verifySignature,
} from '../../../../supabase/functions/_whatsapp/meta'

// ADR 0055: the only code that speaks WhatsApp Business Platform (Meta Cloud API).
const payload = {
  template: 'quanela_pedido_confirmado',
  language: 'es',
  params: ['customer_name', 'business_name', 'order_number', 'tracking_url'] as const,
  vars: { customer_name: 'Laura', business_name: 'Sopas Doña Ana', order_number: '123', tracking_path: '/menu/sopas/pedido/abc', reason: null },
}

describe('Meta adapter (ADR 0055)', () => {
  it('Graph is Meta (version from the environment) or the platform simulator, only in simulator mode', () => {
    expect(graphBase('live', () => undefined)).toBe('https://graph.facebook.com/v23.0')
    expect(graphBase('test', (k) => (k === 'DK_META_GRAPH_VERSION' ? 'v24.0' : undefined))).toBe('https://graph.facebook.com/v24.0')
    expect(graphBase('simulator', (k) => (k === 'DK_META_GRAPH_TEST_URL' ? 'https://n8n.example/webhook/meta/' : undefined))).toBe('https://n8n.example/webhook/meta')
    expect(graphBase('simulator', () => undefined)).toBeNull()
  })

  it('builds the template message with its variables in order, and the tracking link', () => {
    expect(templateMessage('+57 300 111 0003', { ...payload, params: [...payload.params] }, 'https://quanela.com/')).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '573001110003',
      type: 'template',
      template: {
        name: 'quanela_pedido_confirmado',
        language: { code: 'es' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Laura' },
              { type: 'text', text: 'Sopas Doña Ana' },
              { type: 'text', text: '123' },
              { type: 'text', text: 'https://quanela.com/menu/sopas/pedido/abc' },
            ],
          },
        ],
      },
    })
    expect(textMessage('+573001110003', 'Hola').text.body).toBe('Hola')
  })

  it('cleans parameters as Meta requires (no new lines, tabs, long spaces; never empty)', () => {
    expect(cleanParam('Sin\ngas\t\thoy      ya')).toBe('Sin gas hoy   ya')
    expect(cleanParam('   ')).toBe('-')
    expect(cleanParam(null)).toBe('-')
    expect(cleanParam('x'.repeat(500))).toHaveLength(200)
  })

  it('reads Meta answers: sent, retry later, or a definitive failure with a hint', () => {
    expect(sendOutcome(200, { messages: [{ id: 'wamid.ABC' }] })).toEqual({ ok: true, wamid: 'wamid.ABC', code: null, error: null, retryable: false })
    expect(sendOutcome(400, { error: { code: 130429, message: 'Rate limit hit' } })).toMatchObject({ ok: false, retryable: true, code: '130429' })
    expect(sendOutcome(503, {})).toMatchObject({ ok: false, retryable: true })
    const undeliverable = sendOutcome(400, { error: { code: 131026, message: 'Message undeliverable' } })
    expect(undeliverable).toMatchObject({ ok: false, retryable: false, code: '131026', error: '(#131026) Message undeliverable' })
    expect(errorHint('131047')).toContain('24 horas')
    expect(errorHint('190')).toContain('token')
  })

  it('checks the webhook signature (HMAC-SHA256 of the raw body with the app secret)', async () => {
    const raw = JSON.stringify({ entry: [] })
    const signature = await signBody(raw, 'secreto')
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/)
    expect(await verifySignature(raw, signature, 'secreto')).toBe(true)
    expect(await verifySignature(raw, signature, 'otro')).toBe(false)
    expect(await verifySignature(raw + ' ', signature, 'secreto')).toBe(false)
    expect(await verifySignature(raw, null, 'secreto')).toBe(false)
    expect(await verifySignature(raw, 'sha1=abc', 'secreto')).toBe(false)
  })

  it('parses delivery receipts and inbound messages, by business number', () => {
    const body = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '573005550000', phone_number_id: '1098765432101' },
                contacts: [{ wa_id: '573001110003', profile: { name: 'Laura' } }],
                statuses: [
                  { id: 'wamid.1', status: 'delivered', timestamp: '1791740000', recipient_id: '573001110003' },
                  { id: 'wamid.2', status: 'failed', timestamp: '1791740001', errors: [{ code: 131026, title: 'Message undeliverable' }] },
                ],
                messages: [{ id: 'wamid.IN', from: '573001110003', timestamp: '1791740002', type: 'text', text: { body: 'Quiero 2 sopas' } }],
              },
            },
          ],
        },
      ],
    }
    const parsed = parseWebhook(body)
    expect(parsed.phoneNumberIds).toEqual(['1098765432101'])
    expect(parsed.statuses.map((s) => `${s.wamid}:${s.status}:${s.errorCode ?? '-'}`)).toEqual(['wamid.1:delivered:-', 'wamid.2:failed:131026'])
    expect(parsed.statuses[0].at).toBe(new Date(1791740000 * 1000).toISOString())
    expect(parsed.messages).toEqual([
      { phoneNumberId: '1098765432101', wamid: 'wamid.IN', from: '+573001110003', name: 'Laura', at: new Date(1791740002 * 1000).toISOString(), type: 'text', text: 'Quiero 2 sopas' },
    ])
    expect(parseWebhook({ nope: 1 })).toEqual({ phoneNumberIds: [], statuses: [], messages: [] })
  })

  it('creates the suggested templates as utility, with the examples Meta asks for', () => {
    expect(
      templateCreateRequest({ name: 'quanela_pedido_listo_recoger', language: 'es', body: 'Hola {{1}}, tu pedido #{{2}} está listo para recoger en {{3}}. ¡Te esperamos!', params: ['customer_name', 'order_number', 'business_name'] }),
    ).toEqual({
      name: 'quanela_pedido_listo_recoger',
      language: 'es',
      category: 'UTILITY',
      components: [{ type: 'BODY', text: 'Hola {{1}}, tu pedido #{{2}} está listo para recoger en {{3}}. ¡Te esperamos!', example: { body_text: [['Laura', '123', 'Sopas Doña Ana']] } }],
    })
  })
})
