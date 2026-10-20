import { describe, expect, it } from 'vitest'
import { qrSvgDataUrl } from './qr'
import { previewMenu, SAMPLE_ITEMS } from './sampleMenu'
import {
  contrastIssues,
  contrastRatio,
  DEFAULT_THEME,
  designFrom,
  designKey,
  fixContrast,
  normalizeDesign,
  PALETTES,
  resolveTheme,
  TEMPLATE_IDS,
  TEMPLATES,
  themeFonts,
  themeStyle,
  withTemplate,
} from './themes'

// ADR 0053: a design is a template plus adjustments, presentation only.
describe('themes (ADR 0053)', () => {
  it('without a design the page is the renewed «Moderna» (ADR 0058)', () => {
    expect(resolveTheme(null)).toEqual(DEFAULT_THEME)
    expect(DEFAULT_THEME).toEqual(TEMPLATES.modern.theme)
    expect(DEFAULT_THEME.cards).toMatchObject({ layout: 'list', imagePosition: 'right' })
    expect(DEFAULT_THEME.header).toMatchObject({ style: 'cover', cover: null, logo: null, coverPosition: 'center' })
  })

  it('each template resolves to itself and they differ in structure, not only color', () => {
    for (const id of TEMPLATE_IDS) expect(resolveTheme({ template: id })).toEqual(TEMPLATES[id].theme)
    const shapes = new Set(TEMPLATE_IDS.map((id) => `${TEMPLATES[id].theme.header.style}/${TEMPLATES[id].theme.cards.layout}/${TEMPLATES[id].theme.nav}`))
    expect(shapes.size).toBe(6)
    expect(TEMPLATES.classic.theme.cards.image).toBe('hide')
    expect(TEMPLATES.classic.theme.cards.layout).toBe('menu')
  })

  it('the templates and palettes read well (WCAG AA)', () => {
    for (const id of TEMPLATE_IDS) expect(contrastIssues(TEMPLATES[id].theme)).toEqual([])
    for (const p of PALETTES) expect(contrastIssues({ ...DEFAULT_THEME, colors: p.colors })).toEqual([])
  })

  it('adjustments win over the template; unknown values fall back (never break the page)', () => {
    const t = resolveTheme({ template: 'elegant', colors: { primary: '#123456' }, cards: { layout: 'grid' }, nav: 'select' })
    expect(t.colors.primary).toBe('#123456')
    expect(t.colors.background).toBe(TEMPLATES.elegant.theme.colors.background)
    expect(t.cards.layout).toBe('grid')
    expect(t.nav).toBe('select')
    const bad = resolveTheme({ template: 'nope' as never, colors: { primary: 'red' }, fonts: { heading: 'Comic Sans' as never } })
    expect(bad.template).toBe('modern')
    expect(bad.colors.primary).toBe(TEMPLATES.modern.theme.colors.primary)
    expect(bad.fonts.heading).toBe(TEMPLATES.modern.theme.fonts.heading)
  })

  it('saves only what differs from the template, and round-trips', () => {
    expect(designFrom('dark', TEMPLATES.dark.theme)).toEqual({ template: 'dark' })
    const edited = { ...TEMPLATES.fresh.theme, nav: 'tabs' as const, colors: { ...TEMPLATES.fresh.theme.colors, price: '#000000' } }
    const design = designFrom('fresh', edited)
    expect(design).toEqual({ template: 'fresh', nav: 'tabs', colors: { price: '#000000' } })
    expect(resolveTheme(design)).toEqual(edited)
    expect(designKey({ nav: 'tabs', template: 'fresh' })).toBe(designKey({ template: 'fresh', nav: 'tabs' }))
    expect(designKey(normalizeDesign(null))).toBe(designKey(normalizeDesign(designFrom('modern', DEFAULT_THEME))))
  })

  it('a template change keeps the brand images: logo, header image with its framing, and a photo background (ADR 0058)', () => {
    const mine = {
      ...DEFAULT_THEME,
      header: { ...DEFAULT_THEME.header, cover: 'kitchens/k/branding/cover.webp', coverPosition: 'top' as const, logo: 'kitchens/k/branding/logo.webp' },
      background: { ...DEFAULT_THEME.background, kind: 'image' as const, image: 'kitchens/k/branding/bg.webp', overlay: 'strong' as const },
    }
    const next = withTemplate('artisan', mine)
    expect(next.header).toMatchObject({ style: 'centered', cover: 'kitchens/k/branding/cover.webp', coverPosition: 'top', logo: 'kitchens/k/branding/logo.webp' })
    expect(next.background).toMatchObject({ kind: 'image', image: 'kitchens/k/branding/bg.webp', overlay: 'strong' })
    expect(next.cards.style).toBe('shadow')
  })

  it('the new options resolve, and anything unknown falls back to the template (ADR 0058)', () => {
    const t = resolveTheme({ template: 'fresh', header: { logo: 'kitchens/k/branding/l.webp', coverPosition: 'bottom' }, background: { overlay: 'light' }, fonts: { heading: 'Bricolage Grotesque' } })
    expect(t.header).toMatchObject({ logo: 'kitchens/k/branding/l.webp', coverPosition: 'bottom' })
    expect(t.background.overlay).toBe('light')
    expect(t.fonts.heading).toBe('Bricolage Grotesque')
    const odd = resolveTheme({ template: 'fresh', header: { coverPosition: 'left' as never }, background: { overlay: 'none' as never } })
    expect(odd.header.coverPosition).toBe('center')
    expect(odd.background.overlay).toBe('medium')
  })

  it('the veil over a background photo follows its strength', () => {
    const photo = (overlay: 'light' | 'strong') =>
      themeStyle({ ...DEFAULT_THEME, background: { kind: 'image', texture: 'dots', image: 'kitchens/k/branding/bg.webp', overlay } }, (p) => `/img/${p}`) as Record<string, string>
    expect(photo('light').backgroundImage).toContain('rgba(255, 255, 255, 0.62)')
    expect(photo('strong').backgroundImage).toContain('rgba(255, 255, 255, 0.92)')
    expect(photo('strong').backgroundImage).toContain('url("/img/kitchens/k/branding/bg.webp")')
  })

  it('warns about unreadable pairs and «Corregir» fixes them', () => {
    const bad = { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, text: '#EEEEEE', price: '#F0F0F0' } }
    const issues = contrastIssues(bad)
    expect(issues.map((i) => i.pair)).toEqual(['text-background', 'text-surface', 'price-surface'])
    let fixed = bad
    for (const i of issues) fixed = fixContrast(fixed, i.pair)
    expect(contrastIssues(fixed)).toEqual([])
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21)
  })

  it('loads only the two chosen fonts and gives CSS variables', () => {
    expect(themeFonts(TEMPLATES.elegant.theme)).toEqual(['Cormorant Garamond', 'Outfit'])
    expect(themeFonts({ ...TEMPLATES.elegant.theme, fonts: { heading: 'Lora', body: 'Lora', scale: 'M' } })).toEqual(['Lora'])
    const style = themeStyle(TEMPLATES.dark.theme, (p) => `/img/${p}`) as Record<string, string>
    expect(style['--pm-primary']).toBe('#E8B04B')
    expect(style['--pm-on-primary']).toBe('#111111')
    expect(style.backgroundImage).toContain('linear-gradient')
  })

  it('the QR takes the brand color only when it scans well', () => {
    expect(decodeURIComponent(qrSvgDataUrl('https://x', '#7A1F1F'))).toContain('fill="#7A1F1F"')
    expect(decodeURIComponent(qrSvgDataUrl('https://x', '#D4A64A'))).toContain('fill="#000000"')
  })

  it('the preview uses example dishes only when today is empty', () => {
    const biz = { name: 'X', slug: 'x', iconKey: null, tagline: null }
    expect(previewMenu(null, biz)).toMatchObject({ sample: true, menu: { items: SAMPLE_ITEMS } })
  })
})
