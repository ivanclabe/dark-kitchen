/**
 * Parsing of Copilot's small Markdown (rendering lives in markdown.tsx).
 * Links can only go to Quanela screens: an order, a dish (its recipe), an
 * ingredient or a customer; anything else is plain text.
 */
const ROUTES: Record<string, (id: string) => string> = {
  order: (id) => `/operations/${id}`,
  product: (id) => `/recipes/${id}`,
  ingredient: (id) => `/supply/stock/${id}`,
  customer: (id) => `/customers/${id}`,
}

export function linkTarget(url: string): string | null {
  const m = /^quanela:\/\/(order|product|ingredient|customer)\/([0-9a-f-]{36})$/i.exec(url.trim())
  return m ? ROUTES[m[1].toLowerCase()](m[2].toLowerCase()) : null
}

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'table'; rows: string[][] }

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r/g, '').split('\n')
  const blocks: Block[] = []
  let i = 0
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
    } else if (/^\s*\|/.test(line)) {
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        if (!cells(lines[i]).every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells(lines[i]))
        i++
      }
      blocks.push({ kind: 'table', rows })
    } else if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ''))
      blocks.push({ kind: 'ul', items })
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''))
      blocks.push({ kind: 'ol', items })
    } else if (/^#{1,4}\s+/.test(line)) {
      blocks.push({ kind: 'h', text: line.replace(/^#{1,4}\s+/, '') })
      i++
    } else {
      const text: string[] = []
      while (i < lines.length && lines[i].trim() && !/^\s*(\||[-*•]\s|\d+[.)]\s|#{1,4}\s)/.test(lines[i])) text.push(lines[i++].trim())
      blocks.push({ kind: 'p', text: text.join(' ') })
    }
  }
  return blocks
}
