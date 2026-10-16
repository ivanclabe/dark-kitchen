/* ADR 0064: the phone layout detector, injected in every page by scripts/responsive-audit.ts. */
// Runs in the page. Returns layout problems on a phone viewport.
window.__auditLayout = function () {
  const W = window.innerWidth
  const out = { docWidth: document.documentElement.scrollWidth, viewport: W, offscreen: [], overlaps: [], textOverflow: [] }
  const label = (el) => {
    const t = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.alt || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    const cls = (el.className && typeof el.className === 'string' ? el.className : '').split(' ').slice(0, 3).join('.')
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}「${t}」`
  }
  const hiddenByAria = (el) => el.closest('[aria-hidden="true"]') !== null
  const visible = (el) => el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true
  // The part of an element really painted: cut by ancestors that hide overflow (scroll containers do not hide: they scroll).
  const clipRect = (el) => {
    const r = el.getBoundingClientRect()
    let l = r.left, t = r.top, rr = r.right, b = r.bottom
    let hscroll = false
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p)
      const pr = p.getBoundingClientRect()
      if (cs.overflowX === 'hidden' || cs.overflowX === 'clip') { l = Math.max(l, pr.left); rr = Math.min(rr, pr.right) }
      if (cs.overflowY === 'hidden' || cs.overflowY === 'clip') { t = Math.max(t, pr.top); b = Math.min(b, pr.bottom) }
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') { hscroll = true; l = Math.max(l, pr.left); rr = Math.min(rr, pr.right) }
      // A nested scroller (a column, a list) shows only its window; the page scroller lets everything be reached.
      const pageScroller = p.tagName === 'MAIN' || (pr.width >= 0.9 * W && pr.height >= 0.5 * window.innerHeight && !p.closest('[role=dialog],[aria-modal=true]'))
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && !pageScroller) { t = Math.max(t, pr.top); b = Math.min(b, pr.bottom) }
    }
    return { l, t, r: rr, b, w: rr - l, h: b - t, hscroll, raw: r }
  }
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0)
  // With a dialog open (modal, drawer, sheet), what is behind it is covered on purpose: audit the top one only.
  const dialogs = [...document.querySelectorAll('[aria-modal="true"],[role="dialog"],[role="menu"]')].filter((d) => d.checkVisibility?.() !== false && d.getBoundingClientRect().width > 0)
  const scope = dialogs.length ? dialogs[dialogs.length - 1] : document.body
  out.scope = dialogs.length ? (scope.getAttribute('aria-label') || scope.querySelector('h2')?.textContent || 'dialog').slice(0, 40) : 'page'
  const all = [...scope.querySelectorAll('*')]
  const cands = []
  for (const el of all) {
    if (['SCRIPT', 'STYLE', 'svg', 'path', 'BR', 'OPTION', 'HTML', 'BODY'].includes(el.tagName)) continue
    if (el.closest('svg')) continue
    const interactive = el.matches('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=switch],[role=tab],[role=checkbox],[role=combobox]')
    const textual = ownText(el) || el.tagName === 'IMG'
    if (!interactive && !textual) continue
    if (hiddenByAria(el) || !visible(el)) continue
    const c = clipRect(el)
    if (c.w < 2 || c.h < 2) continue
    const cs = getComputedStyle(el)
    const fixed = (() => { for (let p = el; p && p !== document.body; p = p.parentElement) { const ps = getComputedStyle(p).position; if (ps === 'fixed' || ps === 'sticky') return ps } return null })()
    cands.push({ el, c, interactive, fixed })
    // Off the right/left edge of the screen, and not inside a horizontal scroller.
    if (!c.hscroll && (c.raw.right > W + 1 || c.raw.left < -1) && cs.position !== 'fixed') out.offscreen.push({ el: label(el), left: Math.round(c.raw.left), right: Math.round(c.raw.right) })
    // Text wider than its own box (it spills over its neighbours).
    const hasAbsChild = [...el.querySelectorAll('*')].some((d) => getComputedStyle(d).position === 'absolute')
    if (textual && !hasAbsChild && el.tagName !== 'IMG' && cs.overflowX === 'visible' && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && cs.display !== 'inline') {
      out.textOverflow.push({ el: label(el), box: el.clientWidth, content: el.scrollWidth })
    }
  }
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      const a = cands[i], b = cands[j]
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue
      // An adornment inside a field (show password, clear, unit) sits on it by design.
      const field = (x) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(x.tagName)
      const absolute = (x) => { for (let p = x, k = 0; p && k < 3; p = p.parentElement, k++) if (getComputedStyle(p).position === 'absolute') return true; return false }
      if ((field(a.el) && absolute(b.el)) || (field(b.el) && absolute(a.el))) continue
      // Same label/control pairs (a label wrapping text next to its input) are fine only if they do not intersect: keep checking.
      // An inline text broken over two lines has a box that covers both lines: compare its line boxes.
      const lines = (x) => (getComputedStyle(x.el).display === 'inline' && x.el.getClientRects().length > 1 ? [...x.el.getClientRects()] : null)
      const la = lines(a), lb = lines(b)
      if (la || lb) {
        const ra = la ?? [a.el.getBoundingClientRect()], rb = lb ?? [b.el.getBoundingClientRect()]
        const hit = ra.some((p) => rb.some((q) => Math.min(p.right, q.right) - Math.max(p.left, q.left) > 1 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 1))
        if (!hit) continue
      }
      const ix = Math.min(a.c.r, b.c.r) - Math.max(a.c.l, b.c.l)
      const iy = Math.min(a.c.b, b.c.b) - Math.max(a.c.t, b.c.t)
      if (ix <= 1 || iy <= 1) continue
      const area = ix * iy
      const minArea = Math.min(a.c.w * a.c.h, b.c.w * b.c.h)
      if (area < 24 || area < 0.2 * minArea) continue
      out.overlaps.push({
        a: label(a.el), b: label(b.el), area: Math.round(area), pct: Math.round((100 * area) / minArea),
        layer: a.fixed || b.fixed ? `${a.fixed ?? 'flow'}/${b.fixed ?? 'flow'}` : 'flow',
        at: [Math.round(Math.max(a.c.l, b.c.l)), Math.round(Math.max(a.c.t, b.c.t))],
      })
      a.el.__hit = true
      b.el.__hit = true
    }
  }
  // Mark them on screen for the capture.
  for (const { el } of cands) {
    if (el.__hit) { el.style.outline = '2px solid #ef4444'; el.style.outlineOffset = '-1px' }
  }
  return out
}
