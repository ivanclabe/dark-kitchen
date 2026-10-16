// ADR 0064 — responsive audit: every screen of Quanela on phone viewports
// (Android 360 px, iPhone 390 px, iPhone SE 320 px) looking for elements
// that overlap, go off the screen or spill out of their box.
//
// Run it against a LOCAL stack with a fictional test user (never real data):
//
//   QUANELA_AUDIT_URL=http://<código>.localhost:5180 \
//   QUANELA_AUDIT_ROOT=http://localhost:5180 \
//   QUANELA_AUDIT_ACCOUNT=<slug de la cuenta> \
//   QUANELA_AUDIT_EMAIL=<usuario de prueba> QUANELA_AUDIT_PASSWORD=<su clave local> \
//   QUANELA_AUDIT_IDS="order=<uuid>,product=<uuid>,ingredient=<uuid>,purchase=<uuid>,customer=<uuid>,dish=<nombre de un plato>" \
//   node scripts/responsive-audit.ts [--devices android,iphone,se] [--only stock] [--out .responsive-audit]
//
// Routes that need an id not given in QUANELA_AUDIT_IDS are skipped. Each
// screen leaves a capture (problems outlined in red) and a JSON report in
// --out; the exit code is 1 when any problem is found.
//
// Engines: Chrome (QUANELA_CHROME) with phone emulation — the real engine of
// Android. Safari-only rules (input zoom, 100vh, fixed inside filters) are
// covered by src/shared/ui/responsiveContract.test.ts.
import { chromium, type BrowserContextOptions } from 'playwright-core'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}
const env = (name: string, fallback?: string) => {
  const v = process.env[name] ?? fallback
  if (v === undefined) throw new Error(`Falta ${name}`)
  return v.replace(/\/$/, '')
}

const DEVICES: Record<string, BrowserContextOptions> = {
  android: {
    viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  },
  // 664 px tall: an iPhone 13/14 with Safari's toolbars showing.
  iphone: {
    viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  },
  se: {
    viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  },
  desktop: { viewport: { width: 1366, height: 768 } },
}

interface Step { click?: string; role?: [string, string]; eval?: string; wait?: number }
interface Route { name: string; path: string; steps?: Step[] }
interface Result { docWidth: number; viewport: number; scope: string; offscreen: unknown[]; overlaps: unknown[]; textOverflow: unknown[] }

const BASE = env('QUANELA_AUDIT_URL')
const ROOT = env('QUANELA_AUDIT_ROOT', BASE)
const ACCOUNT = env('QUANELA_AUDIT_ACCOUNT')
const IDS = Object.fromEntries((process.env.QUANELA_AUDIT_IDS ?? '').split(',').filter(Boolean).map((p) => p.split('=') as [string, string]))
const OUT = arg('out') ?? '.responsive-audit'
const ONLY = arg('only')
const devices = (arg('devices') ?? 'android,iphone,se').split(',')

const here = new URL('./responsive/', import.meta.url)
const detect = readFileSync(new URL('detect.js', here), 'utf8')
const routes = JSON.parse(readFileSync(new URL('routes.json', here), 'utf8')) as Route[]

/** {order} → its id; null when a placeholder has no value (the route is skipped). */
function fill(text: string): string | null {
  let missing = false
  const out = text.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (key === 'root') return ROOT
    if (IDS[key] === undefined) missing = true
    return IDS[key] ?? ''
  })
  return missing ? null : out
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.QUANELA_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
let problems = 0
for (const device of devices) {
  const context = await browser.newContext(DEVICES[device])
  await context.addInitScript(detect)
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.locator('input[type=email]').fill(env('QUANELA_AUDIT_EMAIL'))
  await page.locator('input[type=password]').fill(env('QUANELA_AUDIT_PASSWORD'))
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForTimeout(3500)

  const report: Record<string, Result> = {}
  for (const route of routes) {
    if (ONLY && !route.name.includes(ONLY)) continue
    const path = fill(route.path)
    if (path === null) continue
    const url = path.startsWith('http') ? path : `${BASE}/k/${ACCOUNT}${path}`
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 }).catch(() => undefined)
    await page.waitForTimeout(1500)
    for (const step of route.steps ?? []) {
      try {
        if (step.click) await page.locator(step.click).first().click({ timeout: 4000 })
        if (step.role) await page.getByRole(step.role[0] as 'button', { name: step.role[1] }).first().click({ timeout: 4000 })
        if (step.eval) await page.evaluate(fill(step.eval) ?? '')
        await page.waitForTimeout(step.wait ?? 900)
      } catch {
        errors.push(`${route.name}: no se pudo ${JSON.stringify(step)}`)
      }
    }
    const result = (await page.evaluate('window.__auditLayout()')) as Result
    report[route.name] = result
    await page.screenshot({ path: join(OUT, `${device}-${route.name}.png`) })
    const found = result.overlaps.length + result.offscreen.length + result.textOverflow.length + (result.docWidth > result.viewport ? 1 : 0)
    problems += found
    console.log(`${device.padEnd(8)} ${route.name.padEnd(26)} ${found ? `✗ ${found}` : '✓'}`)
  }
  writeFileSync(join(OUT, `${device}.json`), JSON.stringify({ report, errors }, null, 1))
  if (errors.length) console.log(`${device}: ${errors.length} aviso(s) del recorrido`, errors.slice(0, 5))
  await context.close()
}
await browser.close()
console.log(problems ? `\n${problems} problema(s): revisa ${OUT}` : '\nSin superposiciones ni desbordes.')
process.exit(problems ? 1 : 0)
