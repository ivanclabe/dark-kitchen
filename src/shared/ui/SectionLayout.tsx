import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Page } from './Page'
import { PageHeader } from './PageHeader'
import { SubNavLinks, type SubNavLink } from './SubNav'

export type SectionLink = SubNavLink

/**
 * The shell of an administration area of the account (ADR 0026, ADR 0032):
 * Configuración and Usuarios have the layout of Abastecimiento — the header,
 * the underlined bar of sections under it and the content, at the full width.
 */
export function SectionLayout({
  title,
  description,
  icon,
  navLabel,
  sections,
  children,
}: {
  title: string
  description: ReactNode
  /** The icon of the area, the same as in the rail (ADR 0029). */
  icon: LucideIcon
  navLabel: string
  sections: SectionLink[]
  children: ReactNode
}) {
  const { pathname, search } = useLocation()
  const root = useRef<HTMLDivElement>(null)
  // A new section (or sub-section) starts at the top: otherwise a shorter page clamps the scroll and the header lands elsewhere.
  useEffect(() => {
    root.current?.closest('main')?.scrollTo({ top: 0 })
  }, [pathname, search])

  return (
    <div ref={root}>
      <Page>
        <PageHeader title={title} description={description} icon={icon} />
        {sections.length > 1 && <SubNavLinks label={navLabel} items={sections} />}
        <div className="min-w-0">{children}</div>
      </Page>
    </div>
  )
}
