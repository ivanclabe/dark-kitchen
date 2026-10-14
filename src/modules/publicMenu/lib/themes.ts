/**
 * ADR 0053 — the design of the public menu, pure. A design is a template plus
 * the owner's adjustments; resolving it gives CSS variables (colors, fonts,
 * radii) and variants (header, navigation, cards, images). Presentation only:
 * prices, availability and dishes never come from here.
 */
import type { CSSProperties } from 'react'

export const TEMPLATE_IDS = ['modern', 'elegant', 'artisan', 'dark', 'fresh', 'classic'] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

export const FONTS = [
  'Inter',
  'Poppins',
  'Nunito',
  'Montserrat',
  'Lora',
  'Playfair Display',
  'Cormorant Garamond',
  'DM Serif Display',
  'Fraunces',
  'Caveat',
  // ADR 0058: modern faces for the renewed templates.
  'Plus Jakarta Sans',
  'Outfit',
  'Bricolage Grotesque',
] as const
export type FontName = (typeof FONTS)[number]

export type HeaderStyle = 'compact' | 'centered' | 'cover' | 'logo'
export type CardLayout = 'list' | 'grid' | 'large' | 'compact' | 'carousel' | 'menu'
export type CardStyle = 'flat' | 'shadow' | 'outline' | 'rough' | 'glass'
export type NavStyle = 'chips' | 'tabs' | 'select' | 'none'
export type ButtonShape = 'rounded' | 'pill' | 'square'
export type BackgroundKind = 'solid' | 'gradient' | 'texture' | 'image'
export type Texture = 'paper' | 'dots' | 'lines'
/** ADR 0058: how strong the veil over a background photo is (the text must always read). */
export type Overlay = 'light' | 'medium' | 'strong'
/** ADR 0058: which part of the header image shows on a phone. */
export type CoverPosition = 'top' | 'center' | 'bottom'

export interface ThemeColors {
  primary: string
  background: string
  surface: string
  text: string
  muted: string
  price: string
}

export interface ResolvedTheme {
  template: TemplateId
  colors: ThemeColors
  fonts: { heading: FontName; body: FontName; scale: 'S' | 'M' | 'L' }
  background: { kind: BackgroundKind; texture: Texture; image: string | null; overlay: Overlay }
  /** ADR 0058: `cover` works with every header style; `logo` replaces the account icon. */
  header: { style: HeaderStyle; cover: string | null; coverPosition: CoverPosition; logo: string | null; showTagline: boolean; showHours: boolean }
  cards: { layout: CardLayout; style: CardStyle; image: 'show' | 'hide'; imageShape: 'square' | 'rounded' | 'circle'; imagePosition: 'left' | 'right' | 'top'; description: 'full' | 'clamp' | 'hide' }
  nav: NavStyle
  buttons: ButtonShape
}

/** What is saved: the template and only what the owner changed. */
export interface ThemeDesign {
  template?: TemplateId
  colors?: Partial<ThemeColors>
  fonts?: Partial<ResolvedTheme['fonts']>
  background?: Partial<ResolvedTheme['background']>
  header?: Partial<ResolvedTheme['header']>
  cards?: Partial<ResolvedTheme['cards']>
  nav?: NavStyle
  buttons?: ButtonShape
}

export interface TemplateDef {
  id: TemplateId
  name: string
  description: string
  theme: ResolvedTheme
}

const base = (t: Omit<ResolvedTheme, 'template'> & { template: TemplateId }): ResolvedTheme => t

/**
 * Six templates that differ in structure, not just color. ADR 0058 renewed
 * them: modern type, no printed-menu ornaments, and a page that looks
 * finished without dish photos (most dishes have none).
 */
const header = (style: HeaderStyle): ResolvedTheme['header'] => ({ style, cover: null, coverPosition: 'center', logo: null, showTagline: true, showHours: true })
const background = (kind: BackgroundKind, texture: Texture = 'dots'): ResolvedTheme['background'] => ({ kind, texture, image: null, overlay: 'medium' })

export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  modern: {
    id: 'modern',
    name: 'Moderna',
    description: 'Blanca y directa, como las apps de domicilios: portada de borde a borde y platos con la foto a un lado.',
    theme: base({
      template: 'modern',
      colors: { primary: '#E8492B', background: '#FFFFFF', surface: '#F6F5F3', text: '#141414', muted: '#666460', price: '#141414' },
      fonts: { heading: 'Bricolage Grotesque', body: 'Plus Jakarta Sans', scale: 'M' },
      background: background('solid'),
      header: header('cover'),
      cards: { layout: 'list', style: 'flat', image: 'show', imageShape: 'rounded', imagePosition: 'right', description: 'clamp' },
      nav: 'chips',
      buttons: 'pill',
    }),
  },
  elegant: {
    id: 'elegant',
    name: 'Elegante',
    description: 'Crema y oro, títulos con serifa fina y precios alineados con una línea de puntos.',
    theme: base({
      template: 'elegant',
      colors: { primary: '#9A7442', background: '#F8F4EC', surface: '#FFFFFF', text: '#1F1A15', muted: '#756A5E', price: '#1F1A15' },
      fonts: { heading: 'Cormorant Garamond', body: 'Outfit', scale: 'M' },
      background: background('solid', 'paper'),
      header: header('centered'),
      cards: { layout: 'list', style: 'flat', image: 'show', imageShape: 'rounded', imagePosition: 'left', description: 'full' },
      nav: 'tabs',
      buttons: 'pill',
    }),
  },
  artisan: {
    id: 'artisan',
    name: 'Artesanal',
    description: 'Cálida, de cocina de barrio: tonos tierra, títulos con carácter y tarjetas suaves.',
    theme: base({
      template: 'artisan',
      colors: { primary: '#B4532A', background: '#F5EDE1', surface: '#FFFBF5', text: '#2E2118', muted: '#776353', price: '#B4532A' },
      fonts: { heading: 'Fraunces', body: 'Plus Jakarta Sans', scale: 'M' },
      background: background('texture', 'paper'),
      header: header('centered'),
      cards: { layout: 'list', style: 'shadow', image: 'show', imageShape: 'rounded', imagePosition: 'left', description: 'full' },
      nav: 'chips',
      buttons: 'rounded',
    }),
  },
  dark: {
    id: 'dark',
    name: 'Noche',
    description: 'Negro y dorado: portada a todo lo ancho y fotos grandes con el nombre encima.',
    theme: base({
      template: 'dark',
      colors: { primary: '#E8B04B', background: '#0B0B0D', surface: '#17171B', text: '#F4F1EA', muted: '#A39E94', price: '#EDC062' },
      fonts: { heading: 'Outfit', body: 'Outfit', scale: 'M' },
      background: background('gradient'),
      header: header('cover'),
      cards: { layout: 'large', style: 'glass', image: 'show', imageShape: 'rounded', imagePosition: 'top', description: 'clamp' },
      nav: 'chips',
      buttons: 'pill',
    }),
  },
  fresh: {
    id: 'fresh',
    name: 'Fresca',
    description: 'Clara y colorida: menta y coral, letra redondeada y platos en cuadrícula.',
    theme: base({
      template: 'fresh',
      colors: { primary: '#F2604F', background: '#EEF8F3', surface: '#FFFFFF', text: '#12352B', muted: '#4F6B62', price: '#0B7A54' },
      fonts: { heading: 'Outfit', body: 'Nunito', scale: 'M' },
      background: background('solid'),
      header: header('compact'),
      cards: { layout: 'grid', style: 'shadow', image: 'show', imageShape: 'rounded', imagePosition: 'top', description: 'clamp' },
      nav: 'chips',
      buttons: 'pill',
    }),
  },
  classic: {
    id: 'classic',
    name: 'Clásica',
    description: 'Una carta de restaurante: serifa, platos numerados con su precio y sin fotos.',
    theme: base({
      template: 'classic',
      colors: { primary: '#8A2B22', background: '#F6F0E4', surface: '#FFFCF6', text: '#22180F', muted: '#6B5A48', price: '#22180F' },
      fonts: { heading: 'Playfair Display', body: 'Lora', scale: 'M' },
      background: background('solid', 'paper'),
      header: header('logo'),
      cards: { layout: 'menu', style: 'flat', image: 'hide', imageShape: 'circle', imagePosition: 'right', description: 'full' },
      nav: 'tabs',
      buttons: 'rounded',
    }),
  },
}

/** Without a published design, the page is the renewed «Moderna» (ADR 0058). */
export const DEFAULT_THEME: ResolvedTheme = TEMPLATES.modern.theme

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v)
function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback
}

/** Template + adjustments → a complete theme. Anything unknown falls back to the template (never breaks the page). */
export function resolveTheme(design: ThemeDesign | null | undefined): ResolvedTheme {
  if (!design) return DEFAULT_THEME
  const t = TEMPLATES[pick(design.template, TEMPLATE_IDS, 'modern')].theme
  const c = design.colors ?? {}
  const colors = Object.fromEntries((Object.keys(t.colors) as (keyof ThemeColors)[]).map((k) => [k, isHex(c[k]) ? c[k] : t.colors[k]])) as unknown as ThemeColors
  return {
    template: t.template,
    colors,
    fonts: {
      heading: pick(design.fonts?.heading, FONTS, t.fonts.heading),
      body: pick(design.fonts?.body, FONTS, t.fonts.body),
      scale: pick(design.fonts?.scale, ['S', 'M', 'L'] as const, t.fonts.scale),
    },
    background: {
      kind: pick(design.background?.kind, ['solid', 'gradient', 'texture', 'image'] as const, t.background.kind),
      texture: pick(design.background?.texture, ['paper', 'dots', 'lines'] as const, t.background.texture),
      image: design.background?.image ?? t.background.image,
      overlay: pick(design.background?.overlay, ['light', 'medium', 'strong'] as const, t.background.overlay),
    },
    header: {
      style: pick(design.header?.style, ['compact', 'centered', 'cover', 'logo'] as const, t.header.style),
      cover: design.header?.cover ?? t.header.cover,
      coverPosition: pick(design.header?.coverPosition, ['top', 'center', 'bottom'] as const, t.header.coverPosition),
      logo: design.header?.logo ?? t.header.logo,
      showTagline: design.header?.showTagline ?? t.header.showTagline,
      showHours: design.header?.showHours ?? t.header.showHours,
    },
    cards: {
      layout: pick(design.cards?.layout, ['list', 'grid', 'large', 'compact', 'carousel', 'menu'] as const, t.cards.layout),
      style: pick(design.cards?.style, ['flat', 'shadow', 'outline', 'rough', 'glass'] as const, t.cards.style),
      image: pick(design.cards?.image, ['show', 'hide'] as const, t.cards.image),
      imageShape: pick(design.cards?.imageShape, ['square', 'rounded', 'circle'] as const, t.cards.imageShape),
      imagePosition: pick(design.cards?.imagePosition, ['left', 'right', 'top'] as const, t.cards.imagePosition),
      description: pick(design.cards?.description, ['full', 'clamp', 'hide'] as const, t.cards.description),
    },
    nav: pick(design.nav, ['chips', 'tabs', 'select', 'none'] as const, t.nav),
    buttons: pick(design.buttons, ['rounded', 'pill', 'square'] as const, t.buttons),
  }
}

/** Only what differs from the template (what gets saved). */
export function designFrom(template: TemplateId, theme: ResolvedTheme): ThemeDesign {
  const t = TEMPLATES[template].theme
  const diff = <T extends object>(a: T, b: T): Partial<T> | undefined => {
    const out = Object.fromEntries(Object.entries(a).filter(([k, v]) => b[k as keyof T] !== v)) as Partial<T>
    return Object.keys(out).length ? out : undefined
  }
  const design: ThemeDesign = { template }
  const colors = diff(theme.colors, t.colors)
  const fonts = diff(theme.fonts, t.fonts)
  const background = diff(theme.background, t.background)
  const header = diff(theme.header, t.header)
  const cards = diff(theme.cards, t.cards)
  if (colors) design.colors = colors
  if (fonts) design.fonts = fonts
  if (background) design.background = Object.fromEntries(Object.entries(background).filter(([, v]) => v !== null)) as ThemeDesign['background']
  if (header) design.header = Object.fromEntries(Object.entries(header).filter(([, v]) => v !== null)) as ThemeDesign['header']
  if (cards) design.cards = cards
  if (theme.nav !== t.nav) design.nav = theme.nav
  if (theme.buttons !== t.buttons) design.buttons = theme.buttons
  return design
}

// ---------------------------------------------------------------------------
// Colors and contrast
// ---------------------------------------------------------------------------
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

/** The text color that reads on a fill (for buttons on the primary color). */
export function readableOn(hex: string): string {
  return contrastRatio(hex, '#FFFFFF') >= contrastRatio(hex, '#111111') ? '#FFFFFF' : '#111111'
}

export interface ContrastIssue {
  pair: 'text-background' | 'text-surface' | 'price-surface'
  label: string
  ratio: number
}

/** Pairs that do not read well (below WCAG AA for normal text, 4.5). */
export function contrastIssues(theme: ResolvedTheme): ContrastIssue[] {
  const c = theme.colors
  const pairs: [ContrastIssue['pair'], string, string, string][] = [
    ['text-background', 'El texto sobre el fondo', c.text, c.background],
    ['text-surface', 'El texto sobre las tarjetas', c.text, c.surface],
    ['price-surface', 'El precio sobre las tarjetas', c.price, c.surface],
  ]
  return pairs.map(([pair, label, a, b]) => ({ pair, label, ratio: contrastRatio(a, b) })).filter((p) => p.ratio < 4.5)
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------
const FONT_STACK: Record<FontName, string> = {
  Inter: "'Inter', ui-sans-serif, system-ui, sans-serif",
  Poppins: "'Poppins', ui-sans-serif, system-ui, sans-serif",
  Nunito: "'Nunito', ui-sans-serif, system-ui, sans-serif",
  Montserrat: "'Montserrat', ui-sans-serif, system-ui, sans-serif",
  Lora: "'Lora', ui-serif, Georgia, serif",
  'Playfair Display': "'Playfair Display', ui-serif, Georgia, serif",
  'Cormorant Garamond': "'Cormorant Garamond', ui-serif, Georgia, serif",
  'DM Serif Display': "'DM Serif Display', ui-serif, Georgia, serif",
  Fraunces: "'Fraunces', ui-serif, Georgia, serif",
  Caveat: "'Caveat', 'Comic Sans MS', cursive",
  'Plus Jakarta Sans': "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
  Outfit: "'Outfit', ui-sans-serif, system-ui, sans-serif",
  'Bricolage Grotesque': "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif",
}

const SCALE = { S: '15px', M: '16px', L: '17.5px' } as const
/** ADR 0058: the veil of the page color over a background photo — the text must always read. */
const VEIL: Record<Overlay, number> = { light: 0.62, medium: 0.8, strong: 0.92 }
const BUTTON_RADIUS: Record<ButtonShape, string> = { rounded: '0.75rem', pill: '9999px', square: '0.25rem' }

/** The Google Fonts stylesheet for the two fonts of a theme (only those). */
export function fontsHref(theme: ResolvedTheme): string {
  const families = [...new Set([theme.fonts.heading, theme.fonts.body])]
  const spec = (f: FontName) => (f === 'Caveat' ? 'Caveat:wght@500;700' : f === 'DM Serif Display' ? 'DM+Serif+Display' : `${f.replace(/ /g, '+')}:wght@400;500;600;700`)
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${spec(f)}`).join('&')}&display=swap`
}

function textureImage(texture: Texture, text: string): string {
  const ink = encodeURIComponent(text)
  if (texture === 'dots') return `radial-gradient(${hexToRgba(text, 0.08)} 1px, transparent 1px)`
  if (texture === 'lines') return `repeating-linear-gradient(0deg, ${hexToRgba(text, 0.05)} 0 1px, transparent 1px 28px)`
  // Paper: soft noise from an inline SVG (no external file).
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .07 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' fill='${ink}'/%3E%3C/svg%3E")`
}

export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** The CSS variables of a theme, for the root of the page (or the preview). `imageUrl` turns a stored path into a URL. */
export function themeStyle(theme: ResolvedTheme, imageUrl: (path: string) => string): CSSProperties {
  const c = theme.colors
  const bg =
    theme.background.kind === 'gradient'
      ? `linear-gradient(180deg, ${c.background} 0%, ${c.surface} 100%)`
      : theme.background.kind === 'texture'
        ? textureImage(theme.background.texture, c.text)
        : theme.background.kind === 'image' && theme.background.image
          ? `linear-gradient(${hexToRgba(c.background, VEIL[theme.background.overlay])}, ${hexToRgba(c.background, VEIL[theme.background.overlay])}), url("${imageUrl(theme.background.image)}")`
          : 'none'
  return {
    '--pm-bg': c.background,
    '--pm-surface': c.surface,
    '--pm-text': c.text,
    '--pm-muted': c.muted,
    '--pm-primary': c.primary,
    '--pm-on-primary': readableOn(c.primary),
    '--pm-price': c.price,
    '--pm-border': hexToRgba(c.text, 0.12),
    '--pm-soft': hexToRgba(c.text, 0.06),
    '--pm-font-heading': FONT_STACK[theme.fonts.heading],
    '--pm-font-body': FONT_STACK[theme.fonts.body],
    '--pm-btn-radius': BUTTON_RADIUS[theme.buttons],
    backgroundColor: c.background,
    backgroundImage: bg,
    backgroundSize: theme.background.kind === 'texture' && theme.background.texture === 'dots' ? '18px 18px' : theme.background.kind === 'image' ? 'cover' : undefined,
    backgroundAttachment: theme.background.kind === 'image' ? 'fixed' : undefined,
    color: c.text,
    fontFamily: FONT_STACK[theme.fonts.body],
    fontSize: SCALE[theme.fonts.scale],
  } as CSSProperties
}

/** Fixes a pair that does not read well: the text (or price) takes the color that reads on its fill. */
export function fixContrast(theme: ResolvedTheme, pair: ContrastIssue['pair']): ResolvedTheme {
  const c = theme.colors
  if (pair === 'price-surface') return { ...theme, colors: { ...c, price: contrastRatio(c.text, c.surface) >= 4.5 ? c.text : readableOn(c.surface) } }
  const text = pair === 'text-background' ? readableOn(c.background) : readableOn(c.surface)
  return { ...theme, colors: { ...c, text, muted: hexToRgbHex(text, c.background, 0.68) } }
}

/** A mix of two colors as hex (for a muted text that keeps contrast). */
function hexToRgbHex(fg: string, bg: string, weight: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16)
  return `#${[1, 3, 5].map((i) => Math.round(ch(fg, i) * weight + ch(bg, i) * (1 - weight)).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

/** Suggested palettes for the editor (any template). */
export const PALETTES: { name: string; colors: ThemeColors }[] = [
  { name: 'Carbón', colors: { primary: '#111111', background: '#FFFFFF', surface: '#F5F5F4', text: '#111111', muted: '#6B6B6B', price: '#111111' } },
  { name: 'Crema y oro', colors: { primary: '#8C6A3E', background: '#FBF7EF', surface: '#FFFFFF', text: '#2B2118', muted: '#6E5E4E', price: '#7A5A30' } },
  { name: 'Terracota', colors: { primary: '#A8481F', background: '#F4E9D8', surface: '#FBF5EA', text: '#3A2A1E', muted: '#6F5A48', price: '#A8481F' } },
  { name: 'Noche dorada', colors: { primary: '#D4A64A', background: '#0E0E10', surface: '#1A1A1E', text: '#F5F1E8', muted: '#A9A39A', price: '#E4BC6A' } },
  { name: 'Menta y coral', colors: { primary: '#F2604F', background: '#EAF8F1', surface: '#FFFFFF', text: '#173B2F', muted: '#4F6F63', price: '#D2412F' } },
  { name: 'Vino y pergamino', colors: { primary: '#7A1F1F', background: '#F3EAD6', surface: '#F8F1E2', text: '#2A1C14', muted: '#6B5947', price: '#7A1F1F' } },
  { name: 'Océano', colors: { primary: '#0E5E8C', background: '#F2F7FA', surface: '#FFFFFF', text: '#0F2533', muted: '#4D6473', price: '#0E5E8C' } },
  { name: 'Oliva', colors: { primary: '#5A6B2E', background: '#F5F4EC', surface: '#FFFFFF', text: '#23271A', muted: '#5D6250', price: '#4B5A22' } },
]

/** A stable text of a design (key order does not matter), to tell whether two designs are the same. */
export function designKey(design: ThemeDesign | null | undefined): string {
  const sort = (v: unknown): unknown =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, sort(x)]),
        )
      : v
  return design ? JSON.stringify(sort(design)) : ''
}

/** A design as the editor would save it (so two ways of writing the same design compare equal). */
export function normalizeDesign(design: ThemeDesign | null | undefined): ThemeDesign {
  const theme = resolveTheme(design)
  return designFrom(theme.template, theme)
}

/** The template with the owner's brand images kept (logo, header image and background survive a template change). */
export function withTemplate(template: TemplateId, current: ResolvedTheme): ResolvedTheme {
  const t = TEMPLATES[template].theme
  const photoBackground = current.background.kind === 'image' && current.background.image
  return {
    ...t,
    background: photoBackground
      ? { ...t.background, kind: 'image', image: current.background.image, overlay: current.background.overlay }
      : { ...t.background, image: current.background.image },
    header: { ...t.header, cover: current.header.cover, coverPosition: current.header.coverPosition, logo: current.header.logo },
  }
}
