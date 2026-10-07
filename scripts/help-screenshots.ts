// ADR 0034: the annotated screenshots of the help center, taken from the real
// app and repeatable (run it again when a screen changes).
//
//   1. Once: sign in to the DEMO business (fictitious data) by hand.
//        QUANELA_HELP_URL=https://<código>.quanela.com node scripts/help-screenshots.ts --login
//      Chrome opens on the login page; when you are inside, the session is
//      kept in .help-session.local (ignored by git; delete it when done).
//   2. The screenshots:
//        QUANELA_HELP_URL=https://<código>.quanela.com node scripts/help-screenshots.ts [--only kitchen-view,login] [--headed]
//
// * Without a saved session, only the public scenes (login, registro) are taken.
// * Uses the Chrome installed on this computer (playwright-core, nothing is downloaded).
// * Each scene (content/help/screenshots.json): open a screen, optionally
//   click and type, wait, draw numbered markers on its parts, save public/help/img/<id>.png.
// * Privacy: a scene is NOT saved if the screen shows a phone or an e-mail that
//   is not one of the demo's (QUANELA_HELP_ALLOW, comma separated).
// * QUANELA_HELP_REPLACE="Ivan Clavijo=Laura Gómez;Ivan=Laura": texts replaced on
//   screen before each capture (the signed-in person's name never goes public).
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from 'playwright-core'

interface Target {
  /** Visible text of the element (the first match), or… */
  text?: string
  /** …a CSS selector. */
  selector?: string
  n: number
}

interface Scene {
  id: string
  path: string
  /** Public screens need no session. */
  public?: boolean
  viewport?: 'desktop' | 'mobile'
  /** Clicks before the capture (visible text, or a CSS selector as «css=…»). */
  click?: string[]
  /** An option chosen in a list (e.g. the period of Insights): «css=…» or a visible text, and the option's value. */
  select?: { target: string; value: string }[]
  /** Text typed after the clicks (e.g. a question to Copilot), optionally followed by a key. */
  fill?: { target: string; text: string; press?: string }[]
  /** Text that must be on screen before the capture. */
  waitFor?: string
  /** Only this part of the screen (CSS selector), with a margin: for screens with a lot of empty space. */
  crop?: string
  annotate: Target[]
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = (process.env.QUANELA_HELP_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const ALLOW = new Set((process.env.QUANELA_HELP_ALLOW ?? '').split(',').map((s) => s.trim()).filter(Boolean))
const REPLACE = (process.env.QUANELA_HELP_REPLACE ?? '')
  .split(';')
  .map((pair) => pair.split('='))
  .filter((p): p is [string, string] => p.length === 2 && p[0].trim() !== '')
  .map(([from, to]) => [from.trim(), to.trim()] as [string, string])
const CHROME = process.env.QUANELA_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1]?.split(',') : null

const scenes = (JSON.parse(readFileSync(join(ROOT, 'content/help/screenshots.json'), 'utf8')) as { scenes: Scene[] }).scenes.filter((s) => !only || only.includes(s.id))
const SESSION_FILE = join(ROOT, '.help-session.local')
const outDir = join(ROOT, 'public/help/img')
mkdirSync(outDir, { recursive: true })

async function locate(page: Page, target: string) {
  return target.startsWith('css=') ? page.locator(target.slice(4)).first() : page.getByText(target, { exact: false }).locator('visible=true').first()
}

/** Numbered markers drawn over the screen (the same numbers as the notes under the image). */
async function annotate(page: Page, targets: Target[]) {
  const boxes = []
  for (const t of targets) {
    const loc = t.selector ? page.locator(t.selector).first() : page.getByText(t.text ?? '', { exact: false }).locator('visible=true').first()
    const box = await loc.boundingBox().catch(() => null)
    if (!box) throw new Error(`no encontré la parte ${t.n} («${t.text ?? t.selector}»)`)
    boxes.push({ ...box, n: t.n })
  }
  await page.evaluate((items) => {
    // No focus ring left on screen (it would look like one more marker).
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    const SIZE = 24
    const placed: { x: number; y: number }[] = []
    const inBox = (x: number, y: number, b: { x: number; y: number; width: number; height: number }, pad = 0) =>
      x >= b.x - pad && x <= b.x + b.width + pad && y >= b.y - pad && y <= b.y + b.height + pad
    /** Is something worth reading under this point (text, a control, an icon), outside the marked part? */
    const busy = (x: number, y: number, own: (typeof items)[number]) => {
      if (x < 2 || y < 2 || x > innerWidth - 2 || y > innerHeight - 2) return true
      if (inBox(x, y, own)) return false
      if (items.some((o) => o !== own && inBox(x, y, o, 6))) return true
      if (placed.some((p) => Math.abs(p.x - x) < SIZE + 4 && Math.abs(p.y - y) < SIZE + 4)) return true
      const el = document.elementFromPoint(x, y)
      if (!el) return false
      if (el.closest('button, a, input, select, textarea, label, svg, img, [role=button], [role=tab]')) return true
      return [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '')
    }
    const free = (cx: number, cy: number, own: (typeof items)[number]) =>
      [[0, 0], [-10, -10], [10, -10], [-10, 10], [10, 10]].every(([dx, dy]) => !busy(cx + dx, cy + dy, own))
    for (const b of items) {
      const midY = b.y + Math.min(b.height, 40) / 2
      // Left of the part, above it, right of it, below it, then over its top-left corner.
      const candidates = [
        [b.x - 26, midY],
        [b.x + 12, b.y - 22],
        [b.x + b.width + 26, midY],
        [b.x + 12, b.y + b.height + 22],
        [b.x - 2, b.y - 2],
      ]
      const [cx, cy] = candidates.find(([x, y]) => free(x, y, b)) ?? candidates[0]
      placed.push({ x: cx, y: cy })
      const ring = document.createElement('div')
      ring.style.cssText = `position:fixed;left:${b.x - 4}px;top:${b.y - 4}px;width:${b.width + 8}px;height:${b.height + 8}px;border:2px solid #f97316;border-radius:10px;z-index:2147483646;pointer-events:none;box-shadow:0 0 0 4px rgba(249,115,22,.18)`
      const badge = document.createElement('div')
      badge.textContent = String(b.n)
      badge.style.cssText = `position:fixed;left:${cx - SIZE / 2}px;top:${cy - SIZE / 2}px;width:${SIZE}px;height:${SIZE}px;border-radius:999px;background:#f97316;color:#fff;font:700 13px/24px system-ui;text-align:center;z-index:2147483647;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,.4)`
      document.body.append(ring, badge)
    }
  }, boxes)
}

/** The configured texts replaced in every text node and attribute shown (longest first). */
async function replaceTexts(page: Page) {
  if (REPLACE.length === 0) return
  await page.evaluate((pairs) => {
    const sorted = [...pairs].sort((a, b) => b[0].length - a[0].length)
    const swap = (text: string) => sorted.reduce((t, [from, to]) => t.split(from).join(to), text)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue) n.nodeValue = swap(n.nodeValue)
    for (const el of document.querySelectorAll('[aria-label],[title],[alt]')) {
      for (const attr of ['aria-label', 'title', 'alt']) {
        const v = el.getAttribute(attr)
        if (v) el.setAttribute(attr, swap(v))
      }
    }
  }, REPLACE)
}

/** Phones and e-mails on screen that are not the demo's: the capture would expose real data. */
async function privacyIssues(page: Page): Promise<string[]> {
  const text = await page.evaluate(() => document.body.innerText)
  const found = [...text.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+|(?:\+?57\s?)?3\d{2}[\s-]?\d{3}[\s-]?\d{4}/g)].map((m) => m[0].trim())
  return [...new Set(found)].filter((v) => !ALLOW.has(v))
}

/** Sign in by hand (nobody types a password for you) and keep the session for the next runs. */
async function login() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: false })
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'es-CO' })
  const page = await context.newPage()
  await page.goto(`${BASE}/login`)
  console.log('Inicia sesión en la cuenta DEMO en la ventana de Chrome (tienes 5 minutos)…')
  await page.waitForURL((url) => !/\/(login|cuentas)\b/.test(url.pathname), { timeout: 300_000 })
  await page.waitForLoadState('networkidle')
  await context.storageState({ path: SESSION_FILE })
  await browser.close()
  console.log('Sesión guardada en .help-session.local. Ahora corre el script sin --login.')
}

async function main() {
  const hasSession = existsSync(SESSION_FILE)
  const browser = await chromium.launch({ executablePath: CHROME, headless: !args.includes('--headed') })
  let taken = 0
  for (const scene of scenes) {
    if (!scene.public && !hasSession) {
      console.log(`  · ${scene.id}: necesita la sesión de la cuenta demo (corre primero con --login); se omite`)
      continue
    }
    const mobile = scene.viewport === 'mobile'
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
      locale: 'es-CO',
      storageState: !scene.public && hasSession ? SESSION_FILE : undefined,
    })
    const missing = [...scene.path.matchAll(/\{([A-Z_]+)\}/g)].map((m) => `QUANELA_HELP_${m[1]}`).filter((v) => !process.env[v])
    if (missing.length) {
      console.log(`  · ${scene.id}: falta ${missing.join(', ')} (el id de la cuenta demo); se omite`)
      await context.close()
      continue
    }
    const path = scene.path.replace(/\{([A-Z_]+)\}/g, (_, v: string) => process.env[`QUANELA_HELP_${v}`] ?? '')
    const page = await context.newPage()
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
      for (const c of scene.click ?? []) {
        await (await locate(page, c)).click()
        await page.waitForTimeout(500)
      }
      for (const o of scene.select ?? []) {
        await (await locate(page, o.target)).selectOption(o.value)
        await page.waitForTimeout(1500)
      }
      for (const f of scene.fill ?? []) {
        const field = await locate(page, f.target)
        await field.fill(f.text)
        if (f.press) await field.press(f.press)
      }
      if (scene.waitFor) await page.getByText(scene.waitFor, { exact: false }).first().waitFor({ timeout: 45_000 })
      await page.waitForTimeout(800)
      await replaceTexts(page)
      const issues = await privacyIssues(page)
      if (issues.length) throw new Error(`hay datos que parecen reales en pantalla (${issues.join(', ')}): usa la cuenta demo o agrégalos a QUANELA_HELP_ALLOW`)
      await annotate(page, scene.annotate)
      const box = scene.crop ? await page.locator(scene.crop).first().boundingBox() : null
      const pad = 48
      const view = page.viewportSize() ?? { width: 1440, height: 900 }
      const clip = box ? { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: Math.min(view.width, box.width + pad * 2), height: Math.min(view.height, box.height + pad * 2) } : undefined
      await page.screenshot({ path: join(outDir, `${scene.id}.png`), clip })
      taken++
      console.log(`  ✓ ${scene.id}`)
    } catch (err) {
      console.log(`  ✗ ${scene.id}: ${err instanceof Error ? err.message.split('\n')[0] : err}`)
    } finally {
      await context.close()
    }
  }
  await browser.close()
  console.log(`\n${taken} captura(s) en public/help/img. Corre «npm run help» para publicarlas en los artículos.`)
}

void (args.includes('--login') ? login() : main())
