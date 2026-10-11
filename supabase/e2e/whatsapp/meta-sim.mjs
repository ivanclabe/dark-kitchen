// A local stand-in for Meta's Graph API and its webhook callbacks (ADR 0055, E2E only).
import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'

const PORT = Number(process.env.SIM_PORT ?? 4010)
const WEBHOOK = process.env.SIM_WEBHOOK
const APP_SECRET = process.env.SIM_APP_SECRET
const sent = []
const templates = new Map()
const inbound = []
let n = 0
let failOnce = new Set(['+573001110500'])

function sign(raw) {
  return 'sha256=' + createHmac('sha256', APP_SECRET).update(raw).digest('hex')
}
async function callback(phoneNumberId, value) {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '573005550000', phone_number_id: phoneNumberId }, ...value } }] }] })
  const res = await fetch(WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) }, body })
  return res.status
}
const read = (req) => new Promise((resolve) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => resolve(d)) })
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const parts = url.pathname.split('/').filter(Boolean)
  const raw = req.method === 'POST' ? await read(req) : ''
  if (url.pathname === '/_log') return json(res, 200, { sent, templates: [...templates.values()], inbound })
  if (url.pathname === '/_inbound' && req.method === 'POST') {
    // Simulate a customer writing to the business number.
    const { phoneNumberId, from, name, text } = JSON.parse(raw)
    const id = `wamid.IN${Date.now()}.${++n}`
    inbound.push({ id, from, text })
    const status = await callback(phoneNumberId, { contacts: [{ wa_id: from.replace('+', ''), profile: { name } }], messages: [{ id, from: from.replace('+', ''), timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }] })
    return json(res, 200, { id, webhookStatus: status })
  }
  if (url.pathname === '/_badsig' && req.method === 'POST') {
    const body = JSON.stringify({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: JSON.parse(raw).phoneNumberId }, statuses: [] } }] }] })
    const r = await fetch(WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) }, body })
    return json(res, 200, { status: r.status })
  }
  const auth = req.headers.authorization ?? ''
  if (!auth.startsWith('Bearer ')) return json(res, 401, { error: { code: 190, message: 'Invalid OAuth access token' } })

  // POST /{phone_number_id}/messages
  if (req.method === 'POST' && parts[1] === 'messages') {
    const msg = JSON.parse(raw)
    const to = '+' + msg.to
    if (to.endsWith('0666')) return json(res, 400, { error: { code: 131026, message: 'Message undeliverable' } })
    if (failOnce.has(to)) { failOnce.delete(to); return json(res, 500, { error: { code: 2, message: 'Service temporarily unavailable' } }) }
    const id = `wamid.SIM${Date.now()}.${++n}`
    sent.push({ id, phoneNumberId: parts[0], to, type: msg.type, template: msg.template?.name, language: msg.template?.language?.code, params: (msg.template?.components?.[0]?.parameters ?? []).map((p) => p.text), text: msg.text?.body ?? null, token: auth.slice(7, 12) + '…' })
    setTimeout(() => void callback(parts[0], { statuses: [{ id, status: 'sent', timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: msg.to }] }), 150)
    setTimeout(() => void callback(parts[0], { statuses: [{ id, status: 'delivered', timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: msg.to }] }), 400)
    setTimeout(() => void callback(parts[0], { statuses: [{ id, status: 'read', timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: msg.to }] }), 800)
    return json(res, 200, { messaging_product: 'whatsapp', contacts: [{ input: msg.to, wa_id: msg.to }], messages: [{ id }] })
  }
  // POST/GET /{waba}/message_templates
  if (parts[1] === 'message_templates') {
    if (req.method === 'POST') {
      const t = JSON.parse(raw)
      templates.set(`${t.name}:${t.language}`, { id: `tpl_${t.name}`, name: t.name, language: t.language, category: t.category, body: t.components?.[0]?.text, example: t.components?.[0]?.example, status: 'APPROVED' })
      return json(res, 200, { id: `tpl_${t.name}`, status: 'PENDING', category: t.category })
    }
    return json(res, 200, { data: [...templates.values()].map(({ id, name, language, status }) => ({ id, name, language, status })) })
  }
  // GET /{phone_number_id}?fields=…
  if (req.method === 'GET' && parts.length === 1) {
    return json(res, 200, { id: parts[0], display_phone_number: '+57 300 555 0000', verified_name: 'Sopas E2E', quality_rating: 'GREEN', code_verification_status: 'VERIFIED' })
  }
  json(res, 404, { error: { code: 100, message: 'Unknown path ' + url.pathname } })
}).listen(PORT, () => console.log('meta-sim on', PORT))
