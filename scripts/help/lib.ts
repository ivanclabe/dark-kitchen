// ADR 0034: content/help (Markdown + metadata) → the help center and the
// knowledge base of «Oye Quanela». One source; everything else is generated
// and checked here: required fields, unique ids, links between articles,
// screenshots, and the screens they point to.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { Marked, type Tokens } from 'marked'
import { parse as parseYaml } from 'yaml'
import type { KbArticle } from '../../supabase/functions/_shared/kbTypes.ts'

export interface Shot {
  id: string
  alt: string
  notes: string[]
  /** The image exists in public/help/img (it is taken with scripts/help-screenshots.ts). */
  ready: boolean
}

export interface HelpArticle {
  id: string
  section: string
  url: string
  title: string
  summary: string
  audience: string[]
  permissions: string[]
  appPath: string | null
  related: string[]
  updated: string
  order: number
  html: string
  headings: { id: string; text: string; level: number }[]
  shots: Shot[]
}

export interface HelpSection {
  id: string
  title: string
  description: string
  articles: string[]
}

export interface HelpBuild {
  sections: HelpSection[]
  articles: Record<string, HelpArticle>
  kb: KbArticle[]
  errors: string[]
}

const AUDIENCES = new Set(['owner', 'admin', 'manager', 'cashier', 'kitchen', 'inventory', 'delivery', 'everyone'])
/** The first segment of every screen of the app (src/app/routes.tsx). */
const APP_ROOTS = new Set(['dashboard', 'operations', 'menu-planner', 'recipes', 'supply', 'customers', 'consumer', 'insights', 'staff', 'my-shifts', 'users', 'settings', 'perfil', 'cuentas', 'registro', 'login'])

const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const plain = (md: string) =>
  md
    .replace(/\{\{screenshot:[^}]+\}\}/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>|]/g, ' ')
    .replace(/^\s*[-\d.]+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : name.endsWith('.md') ? [path] : []
  })
}

function splitFrontmatter(source: string): { meta: Record<string, unknown>; body: string } | null {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source)
  if (!m) return null
  return { meta: (parseYaml(m[1]) ?? {}) as Record<string, unknown>, body: m[2] }
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export function buildHelp(root: string): HelpBuild {
  const contentDir = join(root, 'content/help')
  const imgDir = join(root, 'public/help/img')
  const errors: string[] = []
  const sectionsMeta = JSON.parse(readFileSync(join(contentDir, 'sections.json'), 'utf8')).sections as { id: string; title: string; description: string }[]
  const sectionIds = new Set(sectionsMeta.map((s) => s.id))

  // 1. Read and check every article's metadata.
  type Raw = { file: string; meta: Record<string, unknown>; body: string }
  const raws: Raw[] = []
  for (const file of walk(contentDir).sort()) {
    const rel = relative(root, file)
    let parsed: ReturnType<typeof splitFrontmatter>
    try {
      parsed = splitFrontmatter(readFileSync(file, 'utf8'))
    } catch (err) {
      errors.push(`${rel}: el encabezado de metadatos no es válido (${err instanceof Error ? err.message.split('\n')[0] : err}). Pon entre comillas los textos con «: »`)
      continue
    }
    if (!parsed) {
      errors.push(`${rel}: falta el encabezado de metadatos (--- … ---)`)
      continue
    }
    raws.push({ file: rel, ...parsed })
  }
  const ids = new Map<string, string>()
  for (const r of raws) {
    const id = r.meta.id
    if (typeof id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) errors.push(`${r.file}: id inválido`)
    else if (ids.has(id)) errors.push(`${r.file}: id «${id}» repetido (ya está en ${ids.get(id)})`)
    else ids.set(id, r.file)
  }
  const sectionOf = new Map(raws.map((r) => [String(r.meta.id), String(r.meta.section)]))
  const urlOf = (id: string) => `/help/${sectionOf.get(id)}/${id}`

  // 2. Markdown → HTML: no raw HTML, anchors on headings, links between articles, callouts.
  const articles: Record<string, HelpArticle> = {}
  const kb: KbArticle[] = []
  for (const r of raws) {
    const id = String(r.meta.id)
    const m = r.meta
    const where = `${r.file}`
    const section = String(m.section ?? '')
    if (!sectionIds.has(section)) errors.push(`${where}: sección «${section}» no existe en sections.json`)
    for (const key of ['title', 'summary', 'updated'] as const) if (!m[key]) errors.push(`${where}: falta «${key}»`)
    const summary = String(m.summary ?? '')
    if (summary.length > 220) errors.push(`${where}: el resumen tiene ${summary.length} caracteres (máximo 220)`)
    const audience = list(m.audience)
    for (const a of audience) if (!AUDIENCES.has(a)) errors.push(`${where}: audiencia «${a}» desconocida`)
    const appPath = typeof m.appPath === 'string' ? m.appPath : null
    if (appPath && !APP_ROOTS.has(appPath.split(/[/?#]/)[1] ?? '')) errors.push(`${where}: appPath «${appPath}» no es una pantalla de la app`)
    const related = list(m.related)
    for (const rel of related) if (!ids.has(rel)) errors.push(`${where}: el artículo relacionado «${rel}» no existe`)

    // A list item with «: » unquoted is read by YAML as an object and would be lost in silence.
    const lists: [string, unknown][] = [['audience', m.audience], ['permissions', m.permissions], ['questions', m.questions], ['keywords', m.keywords], ['related', m.related]]
    if (Array.isArray(m.screenshots)) for (const s of m.screenshots as Record<string, unknown>[]) lists.push([`screenshots.${String(s.id)}.notes`, s.notes])
    for (const [key, v] of lists) {
      if (Array.isArray(v) && v.some((x) => typeof x !== 'string')) errors.push(`${where}: «${key}» tiene un elemento que no es texto (¿lleva «: »? ponlo entre comillas)`)
    }

    const shotsMeta = Array.isArray(m.screenshots) ? (m.screenshots as Record<string, unknown>[]) : []
    const shots: Shot[] = shotsMeta.map((s) => {
      const shotId = String(s.id ?? '')
      const ready = existsSync(join(imgDir, `${shotId}.png`))
      if (!s.alt) errors.push(`${where}: la captura «${shotId}» no tiene texto alternativo`)
      return { id: shotId, alt: String(s.alt ?? ''), notes: list(s.notes), ready }
    })
    const shotById = new Map(shots.map((s) => [s.id, s]))

    const headings: HelpArticle['headings'] = []
    const marked = new Marked({ gfm: true })
    marked.use({
      renderer: {
        html: (token: Tokens.HTML | Tokens.Tag) => escapeHtml(token.text),
        heading(token: Tokens.Heading) {
          const text = this.parser.parseInline(token.tokens)
          const anchor = slug(token.text)
          if (token.depth >= 2 && token.depth <= 3) headings.push({ id: anchor, text: token.text, level: token.depth })
          return `<h${token.depth} id="${anchor}">${text}</h${token.depth}>\n`
        },
        link(token: Tokens.Link) {
          const text = this.parser.parseInline(token.tokens)
          if (token.href.startsWith('help:')) {
            const target = token.href.slice(5)
            if (!ids.has(target)) errors.push(`${where}: enlace a un artículo que no existe «${target}»`)
            return `<a href="${urlOf(target)}" data-help-link>${text}</a>`
          }
          if (token.href.startsWith('app:')) return `<a href="${escapeHtml(token.href.slice(4))}" data-app-link>${text}</a>`
          return `<a href="${escapeHtml(token.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`
        },
        blockquote(token: Tokens.Blockquote) {
          const inner = this.parser.parse(token.tokens)
          const kind = /^\s*(\*\*)?cuidado/i.test(token.text) ? 'warn' : 'note'
          return `<aside class="help-callout help-callout-${kind}">${inner}</aside>\n`
        },
        image(token: Tokens.Image) {
          errors.push(`${where}: usa {{screenshot:…}} en lugar de una imagen suelta («${token.href}»)`)
          return ''
        },
      },
    })

    // {{screenshot:id}} on its own line → the annotated figure (or its placeholder while it is not taken).
    const parts = r.body.split(/^\{\{screenshot:([a-z0-9-]+)\}\}\s*$/m)
    let html = ''
    const used = new Set<string>()
    parts.forEach((part, i) => {
      if (i % 2 === 0) {
        html += marked.parse(part, { async: false }) as string
        return
      }
      const shot = shotById.get(part)
      if (!shot) {
        errors.push(`${where}: {{screenshot:${part}}} no está en «screenshots»`)
        return
      }
      used.add(part)
      const notes = shot.notes.length ? `<ol class="help-shot-notes">${shot.notes.map((n) => `<li>${marked.parseInline(n, { async: false })}</li>`).join('')}</ol>` : ''
      const image = shot.ready
        ? `<img src="/help/img/${shot.id}.png" alt="${escapeHtml(shot.alt)}" loading="lazy" />`
        : `<div class="help-shot-pending" role="img" aria-label="${escapeHtml(shot.alt)}"><span>Captura en preparación</span><small>${escapeHtml(shot.alt)}</small></div>`
      html += `<figure class="help-shot" id="captura-${shot.id}">${image}<figcaption>${notes}</figcaption></figure>\n`
    })
    for (const s of shots) if (!used.has(s.id)) errors.push(`${where}: la captura «${s.id}» no se usa en el texto`)

    // Steps for «Oye Quanela»: the items of the first numbered list.
    const firstList = new Marked().lexer(r.body).find((t): t is Tokens.List => t.type === 'list' && (t as Tokens.List).ordered)
    const steps = firstList ? firstList.items.map((it) => plain(it.text)).slice(0, 8) : []

    const article: HelpArticle = {
      id,
      section,
      url: urlOf(id),
      title: String(m.title ?? ''),
      summary,
      audience,
      permissions: list(m.permissions),
      appPath,
      related,
      updated: String(m.updated ?? ''),
      order: typeof m.order === 'number' ? m.order : 100,
      html,
      headings,
      shots,
    }
    articles[id] = article
    kb.push({
      id,
      section,
      url: article.url,
      title: article.title,
      summary,
      audience,
      permissions: article.permissions,
      appPath,
      questions: list(m.questions),
      keywords: list(m.keywords),
      steps,
      headings: headings.map((h) => h.text),
      body: plain(r.body).slice(0, 2500),
    })
  }

  const sections: HelpSection[] = sectionsMeta.map((s) => ({
    ...s,
    articles: Object.values(articles)
      .filter((a) => a.section === s.id)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'es'))
      .map((a) => a.id),
  }))
  for (const s of sections) if (s.articles.length === 0) errors.push(`sections.json: la sección «${s.id}» no tiene artículos`)
  kb.sort((a, b) => a.id.localeCompare(b.id))
  return { sections, articles, kb, errors }
}

/** The generated files, as text (written by build-help.ts, compared by the sync test). */
export function renderOutputs(build: HelpBuild): Record<string, string> {
  const header = '// Generated by scripts/build-help.ts from content/help (ADR 0034). Do not edit: change the .md and run `npm run help`.\n'
  const paths = Object.fromEntries(Object.values(build.articles).map((a) => [a.id, a.url]))
  return {
    'src/modules/help/generated/helpContent.ts':
      `${header}import type { HelpArticle, HelpSection } from '../types'\n\n` +
      `export const HELP_SECTIONS: HelpSection[] = ${JSON.stringify(build.sections, null, 2)}\n\n` +
      `export const HELP_ARTICLES: Record<string, HelpArticle> = ${JSON.stringify(build.articles, null, 2)}\n`,
    'src/shared/help/helpPaths.ts': `${header}export const HELP_PATHS: Record<string, string> = ${JSON.stringify(paths, null, 2)}\n`,
    'supabase/functions/_shared/kb.ts': `${header}import type { KbArticle } from './kbTypes.ts'\n\nexport const KB: KbArticle[] = ${JSON.stringify(build.kb, null, 2)}\n`,
  }
}
