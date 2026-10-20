// ADR 0071: builds the legal documents (content/legal) into src/shared/legal/generated/legalContent.ts.
//
// - {{empresa.<campo>}} comes from content/legal/empresa.yaml; an empty field and {{pendiente: …}} render as a
//   highlighted «Pendiente: …» (never invented data). {{cocina.<campo>}} stays for the page to fill per business.
// - The SHA-256 of each document's final text is checked against content/legal/versions.json: changing the text
//   without raising `version` fails the build, because acceptances point to (slug, version, hash).
//
// Usage: `npm run legal` (the build runs it), `npm run legal -- --accept` after raising a version,
// `npm run legal -- --sql` prints the rows to register the published versions in a migration.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Marked } from 'marked'
import { parse as parseYaml } from 'yaml'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'content/legal')
const out = join(root, 'src/shared/legal/generated/legalContent.ts')
const versionsFile = join(dir, 'versions.json')
const args = new Set(process.argv.slice(2))

const COMPANY_LABELS: Record<string, string> = {
  razonSocial: 'razón social',
  nit: 'NIT',
  domicilio: 'domicilio',
  direccion: 'dirección',
  ciudad: 'ciudad',
  telefono: 'teléfono',
  correoDatos: 'correo para datos personales',
  correoPqr: 'correo para PQR',
  correoComercial: 'correo comercial',
  areaDatos: 'área responsable de datos personales',
  sitioWeb: 'sitio web',
  preciosIva: 'si los precios incluyen IVA',
}
const KITCHEN_FIELDS = ['nombre', 'razonSocial', 'nit', 'direccion', 'ciudad', 'telefono']
const SLUGS = ['terminos', 'privacidad', 'suscripciones', 'reembolsos', 'cookies', 'politica-cocina']
// Who accepts each one (dk_legal_documents.acceptance).
const ACCEPTANCE: Record<string, string> = {
  terminos: 'required',
  privacidad: 'required',
  suscripciones: 'billing',
  reembolsos: 'informational',
  cookies: 'informational',
  'politica-cocina': 'customers',
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const pending = (label: string) => `<mark class="legal-pending">Pendiente: ${escapeHtml(label)}</mark>`
const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const errors: string[] = []
const company = (parseYaml(readFileSync(join(dir, 'empresa.yaml'), 'utf8')) ?? {}) as Record<string, unknown>
for (const key of Object.keys(company)) if (!(key in COMPANY_LABELS)) errors.push(`empresa.yaml: campo desconocido «${key}»`)
const missingCompany = Object.keys(COMPANY_LABELS).filter((k) => !String(company[k] ?? '').trim())

// Tokens → final text (the hashed text). {{cocina.*}} stays as a marker the page replaces.
function fillTokens(text: string, file: string, inline = true): string {
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, raw: string) => {
    const pendingMatch = raw.match(/^pendiente:\s*(.+)$/)
    if (pendingMatch) return pending(pendingMatch[1])
    const [scope, field] = raw.split('.')
    if (scope === 'empresa') {
      if (!(field in COMPANY_LABELS)) {
        errors.push(`${file}: dato de empresa desconocido «${raw}»`)
        return ''
      }
      const value = String(company[field] ?? '').trim()
      return value ? escapeHtml(value) : pending(COMPANY_LABELS[field])
    }
    if (scope === 'cocina' && KITCHEN_FIELDS.includes(field)) return inline ? `<span data-kitchen="${field}"></span>` : `{{cocina.${field}}}`
    errors.push(`${file}: marcador desconocido «{{${raw}}}»`)
    return ''
  })
}

interface Doc {
  slug: string
  title: string
  summary: string
  version: string
  effective: string
  order: number
  requiresReacceptance: boolean
  acceptance: string
  sha256: string
  html: string
  toc: { id: string; text: string }[]
}

const docs: Doc[] = []
for (const file of readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md')) {
  const source = readFileSync(join(dir, file), 'utf8')
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    errors.push(`${file}: falta el encabezado (frontmatter)`)
    continue
  }
  const meta = parseYaml(match[1]) as Record<string, unknown>
  const slug = String(meta.slug ?? '')
  if (!SLUGS.includes(slug) || `${slug}.md` !== file) errors.push(`${file}: slug inválido «${slug}»`)
  const version = String(meta.version ?? '')
  if (!/^\d+\.\d+$/.test(version)) errors.push(`${file}: version debe ser «1.0», «1.1»…`)
  const effective = meta.effective instanceof Date ? meta.effective.toISOString().slice(0, 10) : String(meta.effective ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effective)) errors.push(`${file}: effective debe ser una fecha AAAA-MM-DD`)
  const summary = String(meta.summary ?? '')
  if (!summary || summary.length > 220) errors.push(`${file}: summary vacío o de más de 220 caracteres`)

  // The exact text people read: frontmatter that is shown (title, version, date) + the body, tokens filled.
  const body = fillTokens(match[2].trim(), file)
  const title = fillTokens(String(meta.title ?? ''), file, false)
  const canonical = [title, `Versión ${version}`, `Vigente desde ${effective}`, body].join('\n\n')
  const toc: Doc['toc'] = []
  const marked = new Marked({ gfm: true })
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens)
        const id = slugify(text)
        if (depth === 2) toc.push({ id, text: text.replace(/<[^>]+>/g, '') })
        return `<h${depth} id="${id}">${text}</h${depth}>\n`
      },
    },
  })
  const html = (marked.parse(body, { async: false }) as string)
    .replace(/<a href="(https?:\/\/[^"]+)">/g, '<a href="$1" target="_blank" rel="noopener noreferrer">')
    // Tables scroll sideways on a phone instead of widening the page.
    .replace(/<table>/g, '<div class="legal-table" tabindex="0" role="region" aria-label="Tabla"><table>')
    .replace(/<\/table>/g, '</table></div>')
  docs.push({
    slug,
    title,
    summary: fillTokens(summary, file, false),
    version,
    effective,
    order: Number(meta.order ?? 99),
    requiresReacceptance: meta.requiresReacceptance === true,
    acceptance: ACCEPTANCE[slug] ?? 'informational',
    sha256: createHash('sha256').update(canonical, 'utf8').digest('hex'),
    html,
    toc,
  })
}
for (const slug of SLUGS) if (!docs.some((d) => d.slug === slug)) errors.push(`falta content/legal/${slug}.md`)
docs.sort((a, b) => a.order - b.order)

// Same version, same text: otherwise the acceptances would point to a text nobody saw.
type Versions = Record<string, Record<string, string>>
const versions: Versions = existsSync(versionsFile) ? JSON.parse(readFileSync(versionsFile, 'utf8')) : {}
for (const doc of docs) {
  const known = versions[doc.slug]?.[doc.version]
  if (known && known !== doc.sha256) {
    errors.push(`${doc.slug}.md: el texto cambió y la versión sigue en ${doc.version}. Sube «version» y «effective» y corre «npm run legal -- --accept».`)
  } else if (!known && !args.has('--accept')) {
    errors.push(`${doc.slug}.md: la versión ${doc.version} no está registrada. Corre «npm run legal -- --accept» y agrega su fila a una migración («npm run legal -- --sql»).`)
  }
}

if (errors.length) {
  console.error(`Documentos legales: ${errors.length} error(es):\n  - ${errors.join('\n  - ')}`)
  process.exit(1)
}

if (args.has('--accept')) {
  for (const doc of docs) versions[doc.slug] = { ...versions[doc.slug], [doc.version]: doc.sha256 }
  writeFileSync(versionsFile, `${JSON.stringify(versions, null, 2)}\n`)
}

if (args.has('--sql')) {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`
  const rows = docs.map((d) => `  (${q(d.slug)}, ${q(d.version)}, ${q(d.title)}, ${q(d.effective)}, ${q(d.sha256)}, ${q(d.acceptance)}, ${d.requiresReacceptance})`)
  console.log(
    `insert into dk_legal_documents (slug, version, title, effective_date, content_sha256, acceptance, requires_reacceptance) values\n${rows.join(',\n')}\non conflict (slug, version) do nothing;`,
  )
}

const generated = `// Generated by scripts/build-legal.ts from content/legal (ADR 0071). Do not edit.
export interface LegalDocument {
  slug: string
  title: string
  summary: string
  version: string
  effective: string
  order: number
  requiresReacceptance: boolean
  acceptance: 'required' | 'billing' | 'customers' | 'informational'
  sha256: string
  html: string
  toc: { id: string; text: string }[]
}

/** The company that runs Quanela, as filled in content/legal/empresa.yaml (null: not provided yet). */
export const LEGAL_COMPANY: Record<'razonSocial' | 'nit' | 'direccion' | 'ciudad' | 'telefono' | 'correoPqr' | 'correoDatos', string | null> = ${JSON.stringify(
  Object.fromEntries(['razonSocial', 'nit', 'direccion', 'ciudad', 'telefono', 'correoPqr', 'correoDatos'].map((k) => [k, String(company[k] ?? '').trim() || null])),
)}

/** Company fields still empty in content/legal/empresa.yaml (shown as «Pendiente» in the documents). */
export const LEGAL_PENDING_COMPANY_FIELDS: string[] = ${JSON.stringify(missingCompany.map((k) => COMPANY_LABELS[k]))}

export const LEGAL_DOCUMENTS: LegalDocument[] = ${JSON.stringify(docs, null, 2)}
`
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, generated)
if (!args.has('--sql')) {
  console.log(`Documentos legales: ${docs.length} documentos.`)
  if (missingCompany.length) console.warn(`  Aviso: faltan datos de la empresa en content/legal/empresa.yaml: ${missingCompany.map((k) => COMPANY_LABELS[k]).join(', ')}.`)
}
