// A local stand-in for an n8n Webhook node (ADR 0055 E2E only): checks Quanela's signature and keeps the events.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
const PORT = Number(process.env.N8N_PORT ?? 4030)
let secret = null
const events = []
createServer((req, res) => {
  let d = ''
  req.on('data', (c) => (d += c))
  req.on('end', () => {
    if (req.url === '/_secret') { secret = JSON.parse(d).secret; res.end('ok'); return }
    if (req.url === '/_log') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(events)); return }
    const expected = 'sha256=' + createHmac('sha256', secret ?? '').update(d).digest('hex')
    const given = String(req.headers['x-quanela-signature'] ?? '')
    const valid = given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected))
    events.push({ path: req.url, event: req.headers['x-quanela-event'], delivery: req.headers['x-quanela-delivery'], valid, body: JSON.parse(d || '{}') })
    res.writeHead(valid ? 200 : 401, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ received: true }))
  })
}).listen(PORT, () => console.log('n8n-sim on', PORT))
