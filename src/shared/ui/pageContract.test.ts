import { describe, expect, it } from 'vitest'

/**
 * ADR 0029 — the layout contract of the app. Every screen inside the app
 * uses the same header (PageHeader, or the shell SectionLayout of
 * Configuración/Usuarios with its SettingsPage sections) and the same
 * container (Page or that shell): no hand-made <h1>, no own max-width. If a
 * new page breaks it, this test says which one.
 */
/** Every page source of the app, read at build time (like the other catalog tests). */
const SOURCES = import.meta.glob<string>('../../modules/*/pages/*.tsx', { query: '?raw', import: 'default', eager: true })

/** Screens outside the app (no AppLayout): they have their own design. */
const OUTSIDE_APP = new Set(['auth', 'signup', 'landing', 'invitations', 'kitchens'])
/** The Dashboard keeps its own cover (greeting and clock) inside a Page. */
const COVER = new Set(['dashboard/pages/DashboardPage.tsx'])
/** Pages that only choose another page (no UI of their own). */
const ROUTERS = new Set(['menuPlanner/pages/CatalogPage.tsx'])

const source = (page: string) => SOURCES[`../../modules/${page}`]
const pages = Object.keys(SOURCES)
  .map((path) => path.replace('../../modules/', ''))
  .filter((page) => !page.includes('.test.') && !OUTSIDE_APP.has(page.split('/')[0]))

describe('layout contract (ADR 0029)', () => {
  it('finds the pages of the app', () => {
    expect(pages.length).toBeGreaterThan(15)
  })

  it.each(pages.filter((p) => !ROUTERS.has(p)))('%s uses the common header and container', (page) => {
    const code = source(page)
    // No hand-made page title.
    expect(code).not.toMatch(/typography\.h1|<h1[\s>]/)
    // No own page width: widths live in Page / SectionLayout / SettingsPage.
    expect(code).not.toMatch(/className="[^"]*\bmx-auto\b[^"]*\bmax-w-(3xl|4xl|5xl|6xl|7xl)\b/)
    const header = /<PageHeader\b|<SectionLayout\b|<SettingsPage\b/.test(code)
    const container = /<Page\b|<SectionLayout\b|<SettingsPage\b/.test(code)
    if (!COVER.has(page)) expect(header, 'PageHeader (or the Configuración/Usuarios shell)').toBe(true)
    expect(container, 'Page (or the Configuración/Usuarios shell)').toBe(true)
  })
})
