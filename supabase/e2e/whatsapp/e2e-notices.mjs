// ADR 0055 — end-to-end: a status change in the database reaches «Meta» and comes back as delivered/read.
import { createClient } from '../../../node_modules/@supabase/supabase-js/dist/index.mjs'
import { execSync } from 'node:child_process'

const API = process.env.API_URL
const ANON = process.env.ANON_KEY
const KITCHEN = process.env.KITCHEN
const SIM = 'http://localhost:4010'
const results = []
const check = (name, ok, detail = '') => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }
const sql = (q) => execSync(`docker exec ${process.env.E2E_DB_CONTAINER ?? 'supabase_db_quanela-e2e'} psql -U postgres -tAc ${JSON.stringify(q)}`).toString().trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const simLog = async () => (await fetch(`${SIM}/_log`)).json()

const user = createClient(API, ANON, { global: { headers: { 'x-dk-kitchen-id': KITCHEN } }, auth: { persistSession: false } })
const anon = createClient(API, ANON, { auth: { persistSession: false } })
const { error: loginError } = await user.auth.signInWithPassword({ email: 'laura@negocio.co', password: process.env.E2E_PASSWORD })
if (loginError) throw loginError

async function waitNotice(orderId, event, statuses, ms = 20000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const { data } = await user.from('dk_wa_outbox').select('*').eq('order_id', orderId).eq('event', event).maybeSingle()
    if (data && statuses.includes(data.status)) return data
    await sleep(250)
  }
  const { data } = await user.from('dk_wa_outbox').select('*').eq('order_id', orderId).eq('event', event).maybeSingle()
  return data
}
const order = async (phone, optIn, fulfillment = 'delivery') => {
  const { data, error } = await anon.rpc('dk_public_place_order', { p_slug: 'sopas-e2e', p_order: {
    idempotencyKey: crypto.randomUUID(), customer: { name: 'Laura Gómez', phone }, fulfillment, address: 'Calle 10 # 20-30', paymentMethod: 'Efectivo',
    whatsappOptIn: optIn, items: [{ productId: '52000000-0000-0000-0000-00000000e2e1', quantity: 1 }], website: '' } })
  if (error) throw error
  const id = sql(`select id from dk_orders where kitchen_id = '${KITCHEN}' and order_number = ${data.orderNumber}`)
  return { ...data, id }
}

// 1. The business publishes its menu and connects WhatsApp (simulator mode: Graph is the local simulator).
await user.rpc('dk_public_menu_settings_save', { p: { published: true, ordersEnabled: true, delivery: true, pickup: true, deliveryFee: 3000, minOrder: 0, paymentMethods: ['Efectivo'], autoConfirm: true } })
const { data: conn, error: connError } = await user.rpc('dk_wa_connect', { p_phone_number_id: '1098765432101', p_waba_id: '2098765432101', p_access_token: 'EAAG-e2e-local-token-0123456789', p_app_secret: 'e2e-app-secret' })
check('Conectar guarda los secretos y entrega el token de verificación', !connError && /^qn_/.test(conn?.verifyToken ?? ''), connError?.message)
await user.rpc('dk_wa_save_settings', { p: { mode: 'simulator' } })
const vt = conn.verifyToken
const ok = await fetch(`${API}/functions/v1/dk-whatsapp-webhook?hub.mode=subscribe&hub.verify_token=${vt}&hub.challenge=4242`)
const bad = await fetch(`${API}/functions/v1/dk-whatsapp-webhook?hub.mode=subscribe&hub.verify_token=qn_falso&hub.challenge=4242`)
check('Meta verifica el webhook con el token (y rechaza otro)', ok.status === 200 && (await ok.text()) === '4242' && bad.status === 403, `${ok.status}/${bad.status}`)

const { data: chk, error: chkError } = await user.functions.invoke('dk-whatsapp-admin', { body: { action: 'check' } })
const { data: s1 } = await user.rpc('dk_wa_settings')
check('«Probar conexión» lee el número en Graph y marca conectado', !chkError && chk?.ok && s1.account.status === 'connected' && s1.account.verifiedName === 'Sopas E2E', chkError?.message ?? s1.account.status)
const { data: ct } = await user.functions.invoke('dk-whatsapp-admin', { body: { action: 'create_templates' } })
const log0 = await simLog()
const { data: s2 } = await user.rpc('dk_wa_settings')
check('«Crear plantillas en Meta»: 7 plantillas de utilidad, con ejemplos, y quedan aprobadas', log0.templates.length === 7 && log0.templates.every((t) => t.category === 'UTILITY' && t.example) && s2.templates.every((t) => t.metaStatus === 'approved'),
  `${log0.templates.length} creadas · ${s2.templates.map((t) => t.metaStatus).join(',')} · ${JSON.stringify(ct?.problems ?? [])}`)
const { data: menu } = await anon.rpc('dk_public_menu', { p_slug: 'sopas-e2e' })
check('El menú público ofrece aceptar avisos', menu?.ordering?.whatsappNotices === true)

// 2. A web order with consent → confirmed → the notice goes out and comes back read.
const t0 = Date.now()
const o1 = await order('+573001110003', true, 'delivery')
const n1 = await waitNotice(o1.id, 'order_confirmed', ['read'])
const log1 = await simLog()
const m1 = log1.sent.find((m) => m.id === n1?.wamid)
check('Pedido web con aceptación → aviso «confirmado» enviado, entregado y leído', n1?.status === 'read' && !!n1.delivered_at && !!n1.read_at, `${n1?.status} en ${Date.now() - t0} ms`)
check('Meta recibió la plantilla con las variables del pedido y el enlace de seguimiento',
  m1?.template === 'quanela_pedido_confirmado' && m1.to === '+573001110003' && m1.params[0] === 'Laura' && m1.params[1] === 'Sopas E2E' && m1.params[2] === String(o1.orderNumber) && m1.params[3] === `http://localhost:5173/menu/sopas-e2e/pedido/${o1.token}`,
  JSON.stringify(m1?.params))
const { data: track } = await anon.rpc('dk_public_order_status', { p_token: o1.token })
check('El enlace de seguimiento funciona', track?.found === true && track.status === 'CONFIRMADO')

// 3. Kitchen flow on a pickup order: ready for pickup (on) → picked up (off).
const o2 = await order('+573001110004', true, 'pickup')
const item = sql(`select id from dk_order_items where order_id = '${o2.id}'`)
await user.rpc('dk_advance_kitchen_item', { p_order_item_id: item })
await user.rpc('dk_advance_kitchen_item', { p_order_item_id: item })
const n2 = await waitNotice(o2.id, 'order_ready_pickup', ['read'])
const pick = await user.rpc('dk_mark_picked_up', { p_order_id: o2.id })
await sleep(1500)
const events2 = sql(`select string_agg(event || ':' || status, ',' order by created_at) from dk_wa_outbox where order_id = '${o2.id}'`)
check('Cocina marca listo → «listo para recoger» llega; entregado (apagado) no envía', n2?.status === 'read' && !pick.error && events2 === 'order_confirmed:read,order_ready_pickup:read', events2)
const status2 = sql(`select status from dk_orders where id = '${o2.id}'`)
check('El pedido siguió su flujo normal', status2 === 'ENTREGADO', status2)

// 4. Cancelled with a reason.
await user.rpc('dk_cancel_order', { p_order_id: o1.id, p_reason: 'Nos quedamos sin gas' })
const n3 = await waitNotice(o1.id, 'order_cancelled', ['read'])
const m3 = (await simLog()).sent.find((m) => m.id === n3?.wamid)
check('Cancelado → aviso con el motivo', n3?.status === 'read' && m3?.params?.[3] === 'Nos quedamos sin gas', JSON.stringify(m3?.params))

// 5. Without consent: not sent, and the log says why.
const o4 = await order('+573001110007', false)
await sleep(1500)
const n4 = sql(`select status || ' · ' || last_error from dk_wa_outbox where order_id = '${o4.id}'`)
const sentTo7 = (await simLog()).sent.filter((m) => m.to === '+573001110007').length
check('Sin aceptación no se envía nada (y el registro dice por qué)', n4 === 'skipped · El cliente no aceptó avisos por WhatsApp' && sentTo7 === 0, n4)

// 6. A number Meta cannot deliver: failed, with Meta's code and a hint.
const o5 = await order('+573001110666', true)
const n5 = await waitNotice(o5.id, 'order_confirmed', ['failed'])
check('Número sin WhatsApp → fallido con el código de Meta y una explicación', n5?.status === 'failed' && n5.error_code === '131026' && /no tiene WhatsApp/.test(n5.last_error ?? ''), n5?.last_error)

// 7. A Meta hiccup (500): queued again; the scheduled tick (pg_cron) sends it later.
const o6 = await order('+573001110500', true)
const n6a = await waitNotice(o6.id, 'order_confirmed', ['queued'], 8000)
const retryLater = n6a?.status === 'queued' && n6a.attempts === 1 && new Date(n6a.next_attempt_at) > new Date()
sql(`update dk_wa_outbox set next_attempt_at = now() where id = '${n6a?.id}'`)
sql(`select dk_wa_tick()`)
const n6b = await waitNotice(o6.id, 'order_confirmed', ['read'])
check('Error pasajero de Meta → reintento automático y llega', retryLater && n6b?.status === 'read' && n6b.attempts === 2, `${n6a?.status}/${n6a?.attempts} → ${n6b?.status}/${n6b?.attempts}`)
const jobs = sql(`select string_agg(jobname, ',' order by jobname) from cron.job where jobname like 'dk-wa-%'`)
check('pg_cron revisa la cola cada minuto y limpia avisos y mensajes a los 90 días', jobs === 'dk-wa-dispatch,dk-wa-purge,dk-wa-purge-messages', jobs)

// 8. Never twice: three dispatchers at once for one test notice.
const { data: testId } = await user.rpc('dk_wa_send_test', { p_event: 'order_dispatched', p_to: '+573001110099' })
await Promise.all([1, 2, 3].map(() => fetch(`${API}/functions/v1/dk-whatsapp-dispatch`, { method: 'POST' })))
await sleep(1500)
const to99 = (await simLog()).sent.filter((m) => m.to === '+573001110099')
check('Varios despachadores a la vez: el aviso sale una sola vez', to99.length === 1 && to99[0].template === 'quanela_pedido_en_camino', `${to99.length} envíos · ${testId}`)

// 9. A forged notification (wrong signature) is refused.
const forged = await (await fetch(`${SIM}/_badsig`, { method: 'POST', body: JSON.stringify({ phoneNumberId: '1098765432101' }) })).json()
check('Una notificación con firma falsa se rechaza', forged.status === 403, String(forged.status))

// 10. Totals.
const counts = sql(`select string_agg(status || '=' || n, ' ') from (select status, count(*) n from dk_wa_outbox group by status order by status) x`)
const sentTotal = (await simLog()).sent.length
const rows = Number(sql(`select count(*) from dk_wa_outbox where wamid is not null`))
check('Cada envío a Meta corresponde a un aviso (sin duplicados)', sentTotal === rows, `Meta recibió ${sentTotal}; avisos con wamid ${rows}; ${counts}`)

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} pasos OK`)
process.exit(failed ? 1 : 0)
