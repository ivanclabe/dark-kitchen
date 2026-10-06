// ADR 0034: one help article as the knowledge base keeps it — the same index
// feeds the public help center's search and «Oye Quanela» (Copilot).

export interface KbArticle {
  id: string
  section: string
  /** Public address, inside any Quanela host: /help/<section>/<id>. */
  url: string
  title: string
  /** One line; what «Oye Quanela» says. */
  summary: string
  /** Roles it is written for (owner, admin, manager, cashier, kitchen, inventory, delivery). */
  audience: string[]
  /** Permissions that open the screen it explains (any of them). */
  permissions: string[]
  /** The screen in Quanela, when there is one. */
  appPath: string | null
  /** How people ask for it. */
  questions: string[]
  keywords: string[]
  /** The numbered steps, as plain text. */
  steps: string[]
  headings: string[]
  /** Plain text of the article (trimmed), for search. */
  body: string
}
