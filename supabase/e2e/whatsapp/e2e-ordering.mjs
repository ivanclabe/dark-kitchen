// ADR 0055 (fase B) — end-to-end: a customer orders by WhatsApp; the assistant interprets, never invents;
// the order reaches the kitchen; a person can take over; n8n gets signed events and can answer and order.
import { createClient } from '../../../node_modules/@supabase/supabase-js/dist/index.mjs'
import { execSync } from 'node:child_process'

const API = process.env.API_URL, ANON = process.env.ANON_KEY, KITCHEN = process.env.KITCHEN
const META = 'http://localhost:4010', LLM = 'http://localhost:4020', N8N = 'http://localhost:4030'
const PNID = '1098765432101'
const results = []
const check = (name, ok, detail = '') => { results.push({ ok, name }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }
const sql = (q) => execSync(`docker exec ${process.env.E2E_DB_CONTAINER ?? 'supabase_db_quanela-e2e'} psql -U postgres -tAc ${JSON.stringify(q)}`).toString().trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const json = async (u, init) => (await fetch(u, init)).json()

const user = createClient(API, ANON, { global: { headers: { 'x-dk-kitchen-id': KITCHEN } }, auth: { persistSession: false } })
const { error: loginError } = await user.auth.signInWithPassword({ email: 'laura@negocio.co', password: process.env.E2E_PASSWORD })
if (loginError) throw loginError

const say = (from, text, name = 'Pedro') => json(`${META}/_inbound`, { method: 'POST', body: JSON.stringify({ phoneNumberId: PNID, from, name, text }) })
/** The next text WhatsApp message «Meta» delivered to this number after `since` messages. */
async function replyTo(to, since, ms = 15000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const sent = (await json(`${META}/_log`)).sent.filter((m) => m.to === to && m.type === 'text')
    if (sent.length > since) return sent[since].text
    await sleep(200)
  }
  return null
}
const textsTo = async (to) => (await json(`${META}/_log`)).sent.filter((m) => m.to === to && m.type === 'text').length

// 1. The account turns on the assistant.
await user.rpc('dk_wa_save_settings', { p: { orderingMode: 'ai', notificationsEnabled: true } })
const { data: st } = await user.rpc('dk_wa_settings')
check('Pedidos por WhatsApp: modo asistente activo', st.account.orderingMode === 'ai' && st.orderingFeatureEnabled === true, `${st.account.orderingMode}/${st.orderingFeatureEnabled}`)

const P = '+573001110021'
let n = await textsTo(P)
const t0 = Date.now()
await say(P, 'Hola, buenas')
const r1 = await replyTo(P, n++)
check('«Hola» → saludo y menú de hoy con los precios de la base', !!r1 && r1.includes('Sopas E2E') && r1.includes('Sopa de la casa — $12.000') && r1.includes('Jugo de lulo — $5.000'), `${Date.now() - t0} ms · ${r1?.split('\n')[0]}`)

await say(P, 'quiero 2 sopas sin cebolla para recoger')
const r2 = await replyTo(P, n++)
check('«2 sopas sin cebolla para recoger» → resumen con el total real y pide confirmar', !!r2 && r2.includes('2 × Sopa de la casa — $24.000') && r2.includes('sin cebolla') && r2.includes('*Total: $24.000*') && r2.includes('*SÍ*'), r2?.replace(/\n/g, ' | '))

await say(P, 'una lasaña también')
const r3 = await replyTo(P, n++)
check('«una lasaña» → no la inventa: dice que no está y muestra el menú', !!r3 && r3.includes('No encontré «lasaña»') && r3.includes('Este es el menú de hoy'), r3?.split('\n')[0])
// A new summary is needed before «sí» counts.
await say(P, 'listo así, para recoger')
const r3b = await replyTo(P, n++)
check('Antes de crear el pedido vuelve a mostrar el resumen', !!r3b && r3b.includes('*Total: $24.000*') && r3b.includes('*SÍ*'))

await say(P, 'sí')
const r4 = await replyTo(P, n++)
const num = Number((/#(\d+)/.exec(r4 ?? '') ?? [])[1])
const order = num ? sql(`select o.id || '|' || o.channel || '|' || o.status || '|' || o.total || '|' || (select string_agg(i.quantity || 'x' || coalesce(i.observation, ''), ',') from dk_order_items i where i.order_id = o.id) from dk_orders o where o.kitchen_id = '${KITCHEN}' and o.order_number = ${num}`).split('|') : []
check('«sí» → pedido creado por el núcleo de pedidos: canal WhatsApp, en cocina, total del servidor', order[1] === 'WHATSAPP' && order[2] === 'CONFIRMADO' && Number(order[3]) === 24000 && order[4] === '2xsin cebolla',
  `#${num} ${order.slice(1).join(' · ')}`)
check('El cliente recibe el número, el total y su enlace de seguimiento', !!r4 && r4.includes(`*#${num}*`) && r4.includes('*$24.000*') && /http:\/\/localhost:5173\/menu\/sopas-e2e\/pedido\/[0-9a-f-]{36}/.test(r4), r4?.replace(/\n/g, ' | '))
await sleep(1500)
const confirmedNotice = (await json(`${META}/_log`)).sent.find((m) => m.to === P && m.template === 'quanela_pedido_confirmado')
check('Y el aviso «confirmado» por plantilla (quien escribe por WhatsApp acepta avisos de su pedido)', !!confirmedNotice)

// 2. Kitchen: ready for pickup → the customer is told.
const item = sql(`select id from dk_order_items where order_id = '${order[0]}'`)
await user.rpc('dk_advance_kitchen_item', { p_order_item_id: item })
await user.rpc('dk_advance_kitchen_item', { p_order_item_id: item })
await sleep(2000)
const ready = (await json(`${META}/_log`)).sent.find((m) => m.to === P && m.template === 'quanela_pedido_listo_recoger')
check('Cocina marca listo → «listo para recoger» le llega por WhatsApp', !!ready, JSON.stringify(ready?.params))

// 3. The model never saw prices; the dish list was a closed list.
const calls = await json(`${LLM}/_log`)
const mine = calls.filter((c) => c.user.includes('Pedro') || true)
check('El modelo nunca recibió precios ni totales', mine.length >= 4 && mine.every((c) => !/\$|12000|24000|5000/.test(c.user)), `${mine.length} llamadas`)
check('Y solo podía nombrar platos del menú de hoy (lista cerrada), con tool_choice auto', mine.every((c) => Array.isArray(c.refs) && c.refs.join() === 'P1,P2' && c.toolChoice?.type === 'auto'), mine[0]?.refs?.join())
const runs = sql(`select count(*) || ' · ' || coalesce(sum(input_tokens), 0) || ' · ' || string_agg(distinct model, ',') from dk_ai_insights where kitchen_id = '${KITCHEN}' and feature_key = 'whatsapp_ordering' and status = 'ok'`)
check('Cada turno quedó registrado con su modelo y sus tokens (cupo propio)', runs.startsWith('5 ·') && runs.endsWith('claude-haiku-5-5'), runs)

// 4. A person takes over.
await say(P, 'quiero hablar con una persona')
const r5 = await replyTo(P, n++)
const conv = sql(`select id || '|' || status || '|' || needs_attention || '|' || coalesce(attention_reason, '') from dk_wa_conversations where kitchen_id = '${KITCHEN}' and phone = '${P}'`).split('|')
check('«hablar con una persona» → pasa a la bandeja y el asistente calla', !!r5 && r5.includes('una persona') && conv[1] === 'human' && conv[2] === 'true', conv.slice(1).join(' · '))
await say(P, '¿me escuchan?')
await sleep(2500)
check('Con una persona a cargo, el asistente no responde', (await textsTo(P)) === n)
const { error: replyError } = await user.rpc('dk_wa_send_text', { p_conversation_id: conv[0], p_text: 'Hola Pedro, soy Laura. ¿En qué te ayudo?' })
const r6 = await replyTo(P, n++)
check('El equipo responde desde la bandeja', !replyError && r6 === 'Hola Pedro, soy Laura. ¿En qué te ayudo?', replyError?.message)

// 5. BAJA.
await say(P, 'BAJA')
const r7 = await replyTo(P, n++)
const opt = sql(`select (whatsapp_opt_out_at is not null)::text from dk_customers where kitchen_id = '${KITCHEN}' and phone = '${P}'`)
check('«BAJA» → se da de baja al instante y se le confirma', !!r7 && r7.includes('no te enviaremos más avisos') && opt === 'true', opt)

// 6. n8n mode: inbound messages and status changes go to n8n, signed; n8n answers and orders.
const { data: ep } = await user.rpc('dk_integration_save_endpoint', { p_url: 'http://host.docker.internal:4030/webhook/quanela' })
await fetch(`${N8N}/_secret`, { method: 'POST', body: JSON.stringify({ secret: ep.secret }) })
await user.rpc('dk_wa_save_settings', { p: { orderingMode: 'n8n' } })
const Q = '+573001110022'
const qn = await textsTo(Q)
const inbound = await say(Q, 'Hola, ¿hay sopa hoy?', 'Ana')
await sleep(2500)
const events = await json(`${N8N}/_log`)
const ev = events.find((e) => e.event === 'whatsapp.message.received' && e.body.data.from === Q)
check('Modo n8n: el mensaje llega a n8n firmado (y el asistente no responde)', !!ev && ev.valid && ev.body.data.text === 'Hola, ¿hay sopa hoy?' && (await textsTo(Q)) === qn, ev ? `firma ${ev.valid ? 'válida' : 'inválida'}` : 'sin evento')
const qconv = ev?.body?.data?.conversationId
// n8n answers and orders through Quanela (it never holds the Meta token).
const { error: nTextError } = await user.rpc('dk_wa_send_text', { p_conversation_id: qconv, p_text: 'Hola Ana, sí: Sopa de la casa. ¿Te la llevamos?', p_take_over: false })
const { data: nOrder, error: nOrderError } = await user.rpc('dk_wa_place_order_for', { p_conversation_id: qconv, p_order: {
  idempotencyKey: inbound.id, fulfillment: 'delivery', address: 'Calle 5 # 6-7', paymentMethod: 'Efectivo', items: [{ productId: '52000000-0000-0000-0000-00000000e2e1', quantity: 1 }] } })
check('n8n responde y crea el pedido con las reglas del menú (domicilio y precio del servidor)', !nTextError && !nOrderError && Number(nOrder?.total) === 15000 && (await replyTo(Q, qn)) === 'Hola Ana, sí: Sopa de la casa. ¿Te la llevamos?',
  nOrderError?.message ?? `total ${nOrder?.total}`)
await sleep(2500)
const statusEvent = (await json(`${N8N}/_log`)).find((e) => e.event === 'order.status_changed' && e.body.data.orderNumber === nOrder?.orderNumber)
check('Y n8n recibe el cambio de estado del pedido, firmado', !!statusEvent && statusEvent.valid && statusEvent.body.data.status === 'CONFIRMADO' && statusEvent.body.data.channel === 'WHATSAPP',
  statusEvent ? `${statusEvent.body.data.status} · ${statusEvent.body.data.customer.phone}` : 'sin evento')
const invalid = (await json(`${N8N}/_log`)).filter((e) => !e.valid).length
check('Todas las entregas a n8n llevan una firma válida', invalid === 0, `${(await json(`${N8N}/_log`)).length} eventos`)

// 7. Nothing went twice.
const dup = sql(`select count(*) from (select wamid from dk_wa_outbox where wamid is not null group by wamid having count(*) > 1) x`)
const dupOrders = sql(`select count(*) from (select external_reference from dk_orders where channel = 'WHATSAPP' group by kitchen_id, external_reference having count(*) > 1) x`)
check('Sin mensajes ni pedidos duplicados', dup === '0' && dupOrders === '0')

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} pasos OK`)
process.exit(failed ? 1 : 0)
