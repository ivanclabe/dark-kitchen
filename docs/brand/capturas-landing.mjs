// Real captures of the app for the landing devices (local test stack, fictional data).
import { chromium } from '/Users/ivanclabe/Workspace/dark-kitchen/node_modules/playwright-core/index.mjs'
const out = process.argv[2]
const BASE = `http://${process.env.CODE}.localhost:5180`
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
await ctx.addInitScript(() => localStorage.setItem('dk-appearance', JSON.stringify({ theme: process?.env?.T ?? 'dark', textSize: 'normal' })))
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.locator('input[type=email]').fill('laura@negocio.co')
await page.locator('input[type=password]').fill(process.env.E2E_PASSWORD)
await page.getByRole('button', { name: 'Iniciar sesión' }).click()
await page.waitForURL(/\/k\//, { timeout: 20000 })
await page.goto(`${BASE}/k/brasa-y-pan/operations`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.screenshot({ path: `${out}-tablero.png` })
const phone = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const p2 = await phone.newPage()
await p2.goto(`http://localhost:5180/menu/brasa-y-pan`, { waitUntil: 'networkidle' })
await p2.waitForTimeout(1800)
await p2.screenshot({ path: `${out}-menu.png` })
await browser.close()
