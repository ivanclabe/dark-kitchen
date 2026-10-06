/** One article of the help center, as the site shows it (generated from content/help, ADR 0034). */
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
  /** Rendered from Markdown at build time (no raw HTML from the content). */
  html: string
  headings: { id: string; text: string; level: number }[]
  shots: { id: string; alt: string; notes: string[]; ready: boolean }[]
}

export interface HelpSection {
  id: string
  title: string
  description: string
  articles: string[]
}
