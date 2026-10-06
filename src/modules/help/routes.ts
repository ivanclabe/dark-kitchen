import type { RouteObject } from 'react-router-dom'
import { DocsHome, StripHelpPrefix } from './redirects'

// The help center's own chunks, loaded by the router (route «lazy»).
const layout = () => import('./HelpLayout').then((m) => ({ Component: m.HelpLayout }))
const home = () => import('./pages/HelpHomePage').then((m) => ({ Component: m.HelpHomePage }))
const article = () => import('./pages/HelpArticlePage').then((m) => ({ Component: m.HelpArticlePage }))

/** The help center mounted at `path`: «/» on doc.quanela.com, «/help» where there is no root domain. */
export function helpCenterRoutes(path: string): RouteObject {
  return {
    path,
    lazy: layout,
    children: [
      { index: true, lazy: home },
      { path: ':section', lazy: article },
      { path: ':section/:id', lazy: article },
    ],
  }
}

/** doc.quanela.com (ADR 0035): only the help center, without signing in or an organization. */
export const DOCS_ROUTES: RouteObject[] = [{ path: '/help/*', Component: StripHelpPrefix }, helpCenterRoutes('/'), { path: '*', Component: DocsHome }]
