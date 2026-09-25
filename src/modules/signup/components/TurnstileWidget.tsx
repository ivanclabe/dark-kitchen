import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: { sitekey: string; theme?: string; callback: (token: string) => void; 'expired-callback'?: () => void }) => string
      remove: (id: string) => void
    }
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/**
 * CAPTCHA de Cloudflare Turnstile (el que Supabase Auth valida en el
 * registro). Solo se muestra si hay clave de sitio configurada.
 */
export function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let widgetId: string | null = null
    let cancelled = false
    function render() {
      if (cancelled || !ref.current || !window.turnstile) return
      widgetId = window.turnstile.render(ref.current, { sitekey: siteKey, theme: 'dark', callback: onToken, 'expired-callback': () => onToken(null) })
    }
    if (window.turnstile) render()
    else {
      let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
      if (!script) {
        script = document.createElement('script')
        script.src = SCRIPT_SRC
        script.async = true
        document.head.appendChild(script)
      }
      script.addEventListener('load', render)
    }
    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [siteKey, onToken])

  return <div ref={ref} className="min-h-16" />
}
