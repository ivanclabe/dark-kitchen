import { helpHref, stripHelpPrefix } from '@/shared/help/helpUrl'
import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

/** quanela.com/help/… and {code}.quanela.com/help/… → the same page on doc.quanela.com (ADR 0035, D3). */
export function HelpElsewhere() {
  const { pathname, search, hash } = useLocation()
  const target = helpHref(`${pathname}${search}${hash}`)
  useEffect(() => {
    window.location.replace(target)
  }, [target])
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
      <a href={target} className="hover:text-neutral-200">
        Abriendo el centro de ayuda…
      </a>
    </div>
  )
}

/** doc.quanela.com/help/… (an old link) → the same page without the prefix. */
export function StripHelpPrefix() {
  const { pathname, search, hash } = useLocation()
  return <Navigate to={`${stripHelpPrefix(pathname)}${search}${hash}`} replace />
}

/** doc.quanela.com/anything/else/deeper → the start of the help center. */
export function DocsHome() {
  return <Navigate to="/" replace />
}
