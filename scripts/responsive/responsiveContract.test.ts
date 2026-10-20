// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ADR 0064 — the rules that keep Quanela usable on a real phone (Safari iOS,
 * Chrome Android). Each one comes from a bug found in the responsive audit
 * (scripts/responsive-audit.ts); if a change brings it back, this says where.
 */
const SRC = join(__dirname, '../../src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const files = walk(SRC)
  .filter((path) => path.endsWith('.tsx') && !path.includes('.test.') && !path.includes('/generated/'))
  .map((path) => [relative(SRC, path), readFileSync(path, 'utf8')] as const)
const source = (path: string) => files.find(([key]) => key === path)?.[1] ?? ''
const offenders = (pattern: RegExp) => files.filter(([, code]) => pattern.test(code)).map(([path]) => path)
const indexCss = readFileSync(join(SRC, 'index.css'), 'utf8')

describe('responsive contract (ADR 0064)', () => {
  it('reads the sources', () => {
    expect(files.length).toBeGreaterThan(200)
  })

  it('uses dynamic viewport units: vh hides the bottom under the Safari/Chrome toolbars', () => {
    // h-screen, min-h-screen, max-h-screen and arbitrary «…vh» values (dvh is fine).
    expect(offenders(/(?<![\w-])(min-|max-)?h-screen(?![\w-])|\d+vh(?=[\],)\s-])/)).toEqual([])
  })

  it('keeps filters off the mobile app bar (a filter traps its position:fixed menus)', () => {
    // ADR 0072: one top bar for every size (src/app/shell/TopBar.tsx) holds the phone's menus too.
    const mobileBar = source('app/shell/TopBar.tsx').match(/<header className="([^"]*)"/)?.[1] ?? ''
    expect(mobileBar).not.toBe('')
    expect(mobileBar).not.toMatch(/backdrop-|(?<![\w-])blur|(?<![\w-])filter|transform|translate/)
  })

  it('never hides an action behind hover without a touch fallback', () => {
    const hoverOnly = files
      .filter(([, code]) => /opacity-0[^'"`]*group-hover:opacity-100/.test(code))
      .filter(([, code]) => !/\[@media\(hover:none\)\]:opacity-/.test(code))
      .map(([path]) => path)
    expect(hoverOnly).toEqual([])
  })

  it('stops the iOS zoom on focus: fields get 16 px on iOS only', () => {
    expect(indexCss).toMatch(/@supports \(-webkit-touch-callout: none\)\s*\{[\s\S]*font-size: max\(16px, 1em\)/)
  })

  it('keeps toasts inside a phone screen', () => {
    expect(source('shared/ui/Toast.tsx')).toMatch(/fixed inset-x-4[^"]*sm:w-80/)
  })
})

/** ADR 0065 (Fase 4): motion only where it explains something, never endless on the screens that run the day. */
describe('motion contract (ADR 0065)', () => {
  it('no endless pulse or ping on the operational screens', () => {
    for (const path of ['modules/dashboard/pages/DashboardPage.tsx', 'modules/kitchen/components/KitchenStatusLine.tsx', 'app/OnlineIndicator.tsx']) {
      // A loading skeleton may pulse; a status dot may not.
      expect(source(path), path).not.toMatch(/animate-ping|animate-pulse rounded-full/)
    }
  })

  it('never animates every property', () => {
    expect(offenders(/\btransition-all\b/)).toEqual([])
  })

  it('entrances are transitions on transform and opacity, with a fade-only fallback for reduced motion', () => {
    const motion = indexCss.slice(indexCss.indexOf('.motion-backdrop {'))
    expect(motion).toContain('@starting-style')
    expect(motion).not.toMatch(/transition:[^;]*\b(width|height|top|left|margin|padding|all)\b/)
    expect(motion).toMatch(/prefers-reduced-motion: reduce\)\s*{[^@]*transition-property: opacity !important/)
  })
})
