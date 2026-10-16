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
    const mobileBar = source('app/AppLayout.tsx').match(/<header className="([^"]*md:hidden[^"]*)"/)?.[1] ?? ''
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
