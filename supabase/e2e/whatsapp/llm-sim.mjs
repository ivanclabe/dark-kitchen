// A local stand-in for the model (ADR 0055 E2E only): turns a message into intents with fixed rules,
// answers like the Messages API (tool_use) and keeps what it was sent (to check it never saw prices).
import { createServer } from 'node:http'
const PORT = Number(process.env.LLM_PORT ?? 4020)
const calls = []
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const NUM = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4 }

function interpret(user) {
  const msg = fold((/<mensaje>([\s\S]*)<\/mensaje>/.exec(user) ?? [])[1] ?? '')
  const waiting = /<esperando>confirmar<\/esperando>/.test(user)
  const menu = [...user.matchAll(/^(P\d+) · ([^(\n]+) \(/gm)].map((m) => ({ ref: m[1], name: fold(m[2].trim()) }))
  const intents = []
  if (/persona|alguien|humano/.test(msg)) return [{ type: 'human' }]
  if (/\b(hola|buenas)\b/.test(msg)) intents.push({ type: 'greeting' })
  if (/\bmenu\b/.test(msg)) intents.push({ type: 'menu' })
  for (const m of menu) {
    const word = m.name.split(' ')[0].replace(/s$/, '')
    const re = new RegExp(`(\\d+|un|una|uno|dos|tres|cuatro)?\\s*${word}s?\\b`)
    const hit = re.exec(msg)
    if (hit) intents.push({ type: 'add', ref: m.ref, quantity: hit[1] ? Number(hit[1]) || NUM[hit[1]] : 1, ...(/sin cebolla/.test(msg) ? { note: 'sin cebolla' } : {}) })
  }
  if (/lasana/.test(msg)) intents.push({ type: 'unknown_dish', text: 'lasaña' })
  if (/recoger|para llevar/.test(msg)) intents.push({ type: 'fulfillment', value: 'pickup' })
  if (/domicilio/.test(msg)) intents.push({ type: 'fulfillment', value: 'delivery' })
  const address = /((calle|carrera|avenida)[^,\n]*)/.exec(msg)
  if (address) intents.push({ type: 'address', value: address[1].trim() })
  if (/efectivo/.test(msg)) intents.push({ type: 'payment', value: 'Efectivo' })
  if (/transferencia/.test(msg)) intents.push({ type: 'payment', value: 'Transferencia' })
  if (waiting && /^\s*(si|dale|confirmo|listo)\b/.test(msg)) intents.push({ type: 'confirm' })
  return intents.length ? intents : [{ type: 'unclear' }]
}

createServer((req, res) => {
  let d = ''
  req.on('data', (c) => (d += c))
  req.on('end', () => {
    if (req.url === '/_log') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(calls)) }
    const body = JSON.parse(d || '{}')
    const user = body.messages?.[0]?.content ?? ''
    const intents = interpret(user)
    calls.push({ model: body.model, toolChoice: body.tool_choice, refs: body.tools?.[0]?.input_schema?.properties?.intents?.items?.properties?.ref?.enum, user, intents, key: (req.headers['x-api-key'] ?? '').slice(0, 4) })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ id: 'msg_sim', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'tool_use', id: 'tu_1', name: 'interpretar_mensaje', input: { intents } }], stop_reason: 'tool_use', usage: { input_tokens: 420, output_tokens: 35 } }))
  })
}).listen(PORT, () => console.log('llm-sim on', PORT))
