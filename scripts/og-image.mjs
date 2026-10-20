#!/usr/bin/env node
/**
 * Generates public/og-image.png (1200×630), the Open Graph / Twitter card image.
 *
 * ADR 0071 (F6): the previous image was generated with ChatGPT and showed the
 * WhatsApp logo. This one is composed only from the brand's own assets:
 *   - the robot (docs/brand/robot/robot-happy.png),
 *   - the «quanela» wordmark (public/brand/quanela-wordmark.webp, a white mask
 *     painted with CSS `mask`, ADR 0070),
 *   - the brand palette (#F97316, #1C1310, white),
 *   - Nunito and Inter (SIL OFL 1.1), self-hosted via @fontsource-variable.
 * No third-party logos, no remote fonts or images.
 *
 * Run: node scripts/og-image.mjs   (needs playwright-core and Google Chrome)
 */
import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'public/og-image.png')

const dataUrl = (path, type) => `data:${type};base64,${readFileSync(resolve(root, path)).toString('base64')}`

const robot = dataUrl('docs/brand/robot/robot-happy.png', 'image/png')
const wordmark = dataUrl('public/brand/quanela-wordmark.webp', 'image/webp')
const nunito = dataUrl('node_modules/@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2', 'font/woff2')
const inter = dataUrl('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'font/woff2')

const html = /* html */ `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  @font-face { font-family: 'Nunito OG'; src: url(${nunito}) format('woff2'); font-weight: 200 1000; }
  @font-face { font-family: 'Inter OG'; src: url(${inter}) format('woff2'); font-weight: 100 900; }
  :root { --orange: #F97316; --brown: #1C1310; --white: #FFFFFF; }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    position: relative;
    background: var(--brown);
    color: var(--white);
    font-family: 'Inter OG', system-ui, sans-serif;
  }
  .disc {
    position: absolute; left: 765px; top: 105px;
    width: 420px; height: 420px; border-radius: 50%;
    background: #FFF4EB;
  }
  .ring {
    position: absolute; left: 715px; top: 55px;
    width: 520px; height: 520px; border-radius: 50%;
    border: 3px solid var(--orange);
  }
  .robot {
    position: absolute; left: 755px; top: 160px; width: 420px; height: auto;
    filter: drop-shadow(0 14px 18px rgba(28, 19, 16, 0.18));
  }
  .copy { position: absolute; left: 88px; top: 92px; width: 640px; }
  .wordmark {
    width: 260px; height: 64px;
    background: var(--white);
    -webkit-mask: url(${wordmark}) left center / contain no-repeat;
            mask: url(${wordmark}) left center / contain no-repeat;
  }
  h1 {
    margin-top: 58px;
    font-family: 'Nunito OG', system-ui, sans-serif;
    font-weight: 900; font-size: 84px; line-height: 0.98; letter-spacing: -1.5px;
  }
  h1 span { display: block; color: var(--orange); }
  p {
    margin-top: 30px; max-width: 560px;
    font-size: 27px; line-height: 1.38; font-weight: 450;
    color: rgba(255, 255, 255, 0.78);
  }
  .bar { position: absolute; left: 0; bottom: 0; width: 1200px; height: 10px; background: var(--orange); }
</style>
</head>
<body>
  <div class="ring"></div>
  <div class="disc"></div>
  <img class="robot" src="${robot}" alt="" />
  <div class="copy">
    <div class="wordmark" role="img" aria-label="quanela"></div>
    <h1>Tu cocina,<span>más inteligente</span></h1>
    <p>Pedidos, cocina, despacho, menús, inventario y cobros en una sola plataforma.</p>
  </div>
  <div class="bar"></div>
</body>
</html>`

const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: out, type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } })
} finally {
  await browser.close()
}
console.log(`og-image: ${out} (${Math.round(statSync(out).size / 1024)} KB)`)
