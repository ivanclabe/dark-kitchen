import { productImageUrl } from '@/modules/products/lib/productImages'
import { AccountIcon } from '@/shared/avatars/Avatar'
import { formatMoney } from '@/shared/utils/format'
import { whatsappLink } from '@/shared/utils/whatsapp'
import clsx from 'clsx'
import { Bike, Clock, Minus, Plus, Share2, Store, Wallet } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { addLine, availabilityLabel, byCategory, cartTotals, maxQuantity, openLabel, publicMenuUrl, quantityOf, readCart, setQuantity, shareText, writeCart } from '../lib/cart'
import type { ResolvedTheme } from '../lib/themes'
import type { CartLine, PublicMenu, PublicMenuItem } from '../types'
import { CartSheet } from './CartSheet'
import { DishSheet } from './DishSheet'

const heading: CSSProperties = { fontFamily: 'var(--pm-font-heading)' }
const btnRadius: CSSProperties = { borderRadius: 'var(--pm-btn-radius)' }
const primaryBtn = 'bg-(--pm-primary) text-(--pm-on-primary) font-semibold transition active:scale-95 hover:opacity-90 disabled:opacity-40 disabled:active:scale-100'

// ADR 0058: soft, modern surfaces; «rough» stays valid for saved designs but reads as a clean dashed card.
const CARD_STYLE: Record<ResolvedTheme['cards']['style'], string> = {
  flat: 'bg-(--pm-surface)',
  shadow: 'bg-(--pm-surface) shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_28px_-14px_rgba(0,0,0,0.22)]',
  outline: 'bg-(--pm-surface)/60 ring-1 ring-(--pm-border)',
  rough: 'bg-(--pm-surface) ring-1 ring-dashed ring-(--pm-border) border border-dashed border-(--pm-border)',
  glass: 'bg-(--pm-surface)/75 ring-1 ring-(--pm-border) backdrop-blur-md',
}
const IMAGE_SHAPE: Record<ResolvedTheme['cards']['imageShape'], string> = { square: 'rounded-md', rounded: 'rounded-2xl', circle: 'rounded-full' }

/**
 * The public menu, drawn with a theme (ADR 0053). The same tree for the page,
 * the editor's live preview (mode 'preview': nothing is sent) and the
 * template thumbnails. Cart, totals and the order are ADR 0052's, untouched.
 */
export function PublicMenuView({
  slug,
  menu,
  theme,
  mode = 'live',
  onPlaced,
  onRefreshMenu,
}: {
  slug: string
  menu: PublicMenu
  theme: ResolvedTheme
  mode?: 'live' | 'preview'
  onPlaced?: (token: string) => void
  onRefreshMenu?: () => void
}) {
  const today = menu.today
  const [lines, setLines] = useState<CartLine[]>(() => (mode === 'live' ? readCart(slug, today) : []))
  const [cartOpen, setCartOpen] = useState(false)
  // ADR 0059: the dish whose options are being chosen.
  const [configuring, setConfiguring] = useState<PublicMenuItem | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const sections = useRef(new Map<string, HTMLElement>())
  const groups = useMemo(() => byCategory(menu.items), [menu.items])

  // ADR 0058: the category bar follows the scroll (the section at the top of the screen is the active one).
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActiveCategory((top.target as HTMLElement).dataset.category ?? null)
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )
    sections.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [groups])

  useEffect(() => {
    if (mode !== 'live') return
    writeCart(slug, today, lines)
  }, [slug, today, lines, mode])

  const totals = cartTotals(lines, menu, null)
  const url = publicMenuUrl(slug)

  async function share() {
    if (mode === 'preview') return
    const text = shareText(menu, url)
    if (navigator.share) {
      try {
        await navigator.share({ title: `${menu.business.name} · Menú de hoy`, text, url })
      } catch {
        // Cancelled.
      }
      return
    }
    window.open(whatsappLink(null, text), '_blank', 'noopener,noreferrer')
  }

  function goTo(category: string) {
    setActiveCategory(category)
    sections.current.get(category)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const quantity = (item: PublicMenuItem) => quantityOf(lines, item.id)
  const onQuantity = (item: PublicMenuItem) => (q: number) => setLines((ls) => setQuantity(ls, item, q))
  const onConfigure = (item: PublicMenuItem) => () => setConfiguring(item)

  return (
    <div className="mx-auto max-w-3xl pb-32 pm-wide:max-w-4xl">
      <MenuHeader menu={menu} theme={theme} onShare={() => void share()} />
      <InfoStrip menu={menu} theme={theme} />

      {menu.business.message && (
        <p className="mx-4 mt-4 rounded-2xl bg-(--pm-primary)/10 px-4 py-3 text-sm ring-1 ring-(--pm-primary)/20 pm-wide:mx-6">{menu.business.message}</p>
      )}
      {!menu.ordering.enabled && menu.items.length > 0 && (
        <p className="mx-4 mt-4 rounded-2xl bg-(--pm-surface) px-4 py-3 text-sm ring-1 ring-(--pm-border) pm-wide:mx-6">Arma tu pedido y envíalo por WhatsApp al negocio.</p>
      )}

      {menu.items.length === 0 ? (
        <div className="px-6 py-20 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-(--pm-soft) text-(--pm-muted)">
            <Clock size={26} aria-hidden />
          </span>
          <p className="mt-4 text-lg font-semibold" style={heading}>
            Hoy no hay menú publicado
          </p>
          <p className="mt-1 text-sm text-(--pm-muted)">Vuelve más tarde o escríbele al negocio.</p>
        </div>
      ) : (
        <>
          {groups.length > 1 && <CategoryNav theme={theme} categories={groups.map((g) => g.category)} active={activeCategory} onGo={goTo} />}
          <main className="space-y-10 px-4 pt-6 pm-wide:px-6">
            {groups.map((g) => (
              <section
                key={g.category}
                ref={(el) => {
                  if (el) sections.current.set(g.category, el)
                }}
                data-category={g.category}
                className="scroll-mt-20"
                aria-labelledby={`cat-${g.category}`}
              >
                <CategoryTitle theme={theme} name={g.category} count={g.items.length} />
                <DishList theme={theme} items={g.items} quantity={quantity} onQuantity={onQuantity} onConfigure={onConfigure} />
              </section>
            ))}
          </main>
        </>
      )}

      <footer className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-4 pt-14 text-center text-xs text-(--pm-muted)">
        {/* ADR 0071: the business's data policy, reachable before ordering. */}
        {mode === 'live' && (
          <a href={`/menu/${slug}/privacidad`} className="opacity-70 hover:opacity-100">
            Tratamiento de datos
          </a>
        )}
        <a href="https://quanela.com" className="opacity-70 hover:opacity-100">
          Hecho con quanela
        </a>
      </footer>

      {totals.units > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            style={btnRadius}
            aria-label={`Ver pedido · ${totals.units} · ${formatMoney(totals.subtotal)}`}
            className={clsx('mx-auto flex w-full max-w-md items-center gap-3 py-2.5 pr-5 pl-2.5 shadow-[0_14px_36px_-10px_rgba(0,0,0,0.5)]', primaryBtn)}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-black/15 text-sm font-bold tabular-nums">{totals.units}</span>
            <span className="flex-1 text-left">Ver pedido</span>
            <span className="tabular-nums">{formatMoney(totals.subtotal)}</span>
          </button>
        </div>
      )}

      {configuring && (
        <DishSheet
          item={configuring}
          maxQuantity={maxQuantity(configuring) - quantityOf(lines, configuring.id)}
          onClose={() => setConfiguring(null)}
          onConfirm={(options, q) => {
            setLines((ls) => addLine(ls, configuring, options, q))
            setConfiguring(null)
          }}
        />
      )}

      {cartOpen && (
        <CartSheet
          slug={slug}
          menu={menu}
          lines={lines}
          preview={mode === 'preview'}
          onLines={setLines}
          onClose={() => setCartOpen(false)}
          onRefreshMenu={() => onRefreshMenu?.()}
          onPlaced={(token) => {
            setLines([])
            onPlaced?.(token)
          }}
        />
      )}
    </div>
  )
}

const COVER_POSITION: Record<ResolvedTheme['header']['coverPosition'], string> = { top: 'center top', center: 'center center', bottom: 'center bottom' }

/** The header image (ADR 0058: in every header style), or — without one — a soft wash of the brand color. */
function Backdrop({ theme, className }: { theme: ResolvedTheme; className?: string }) {
  const image = theme.header.cover
  return (
    <div
      aria-hidden
      className={clsx('absolute inset-0 bg-cover', className)}
      style={{
        backgroundPosition: COVER_POSITION[theme.header.coverPosition],
        backgroundImage: image
          ? `url("${productImageUrl(image)}")`
          : 'radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--pm-primary) 70%, white) 0%, transparent 55%), radial-gradient(120% 140% at 100% 100%, color-mix(in srgb, var(--pm-primary) 55%, black) 0%, transparent 60%), linear-gradient(135deg, var(--pm-primary), color-mix(in srgb, var(--pm-primary) 60%, black))',
      }}
    />
  )
}

/** The business logo (ADR 0058) or, without one, the account icon. */
function BrandMark({ menu, theme, className }: { menu: PublicMenu; theme: ResolvedTheme; className?: string }) {
  const b = menu.business
  if (theme.header.logo)
    return <img src={productImageUrl(theme.header.logo)} alt="" className={clsx('size-16 shrink-0 rounded-2xl bg-white object-contain p-1', className)} />
  return <AccountIcon iconKey={b.iconKey} seed={b.slug} size="lg" className={clsx('shrink-0 rounded-2xl', className)} />
}

function ShareButton({ onShare, className, glass = false }: { onShare: () => void; className?: string; glass?: boolean }) {
  return (
    <button
      type="button"
      onClick={onShare}
      className={clsx(
        'flex size-10 shrink-0 items-center justify-center rounded-full transition hover:opacity-90',
        glass ? 'bg-black/35 text-white ring-1 ring-white/25 backdrop-blur-md' : 'bg-(--pm-surface) text-(--pm-text) shadow-sm ring-1 ring-(--pm-border)',
        className,
      )}
      aria-label="Compartir el menú"
    >
      <Share2 size={18} aria-hidden />
    </button>
  )
}

function MenuHeader({ menu, theme, onShare }: { menu: PublicMenu; theme: ResolvedTheme; onShare: () => void }) {
  const b = menu.business
  const tagline = theme.header.showTagline && b.tagline ? b.tagline : null
  const hasImage = !!theme.header.cover
  switch (theme.header.style) {
    case 'cover':
      return (
        <header className="relative pm-wide:px-6 pm-wide:pt-6">
          <div className="relative h-60 overflow-hidden pm-wide:h-72 pm-wide:rounded-[2rem]">
            <Backdrop theme={theme} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/5" aria-hidden />
            <ShareButton onShare={onShare} glass className="absolute top-4 right-4" />
            <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-5 text-white pm-wide:p-7">
              <BrandMark menu={menu} theme={theme} className="shadow-lg ring-4 ring-white/90" />
              <div className="min-w-0 pb-0.5">
                <h1 className="text-[1.85rem] leading-[1.1] font-bold tracking-tight drop-shadow-sm pm-wide:text-4xl" style={heading}>
                  {b.name}
                </h1>
                {tagline && <p className="mt-1 text-sm text-white/85 pm-wide:text-base">{tagline}</p>}
              </div>
            </div>
          </div>
        </header>
      )
    case 'centered':
      return (
        <header className="relative text-center">
          {hasImage ? (
            <div className="relative h-40 overflow-hidden pm-wide:mx-6 pm-wide:mt-6 pm-wide:h-52 pm-wide:rounded-[2rem]">
              <Backdrop theme={theme} />
              <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-black/30" aria-hidden />
            </div>
          ) : (
            <div className="h-24 bg-gradient-to-b from-(--pm-primary)/15 to-transparent" aria-hidden />
          )}
          <ShareButton onShare={onShare} glass={hasImage} className="absolute top-4 right-4 pm-wide:top-9 pm-wide:right-9" />
          <div className="relative -mt-10 px-4">
            <BrandMark menu={menu} theme={theme} className="mx-auto shadow-md ring-4 ring-(--pm-bg)" />
            <h1 className="mt-3 text-[2rem] leading-tight font-semibold tracking-tight pm-wide:text-4xl" style={heading}>
              {b.name}
            </h1>
            {tagline && <p className="mx-auto mt-1 max-w-md text-(--pm-muted)">{tagline}</p>}
          </div>
        </header>
      )
    case 'logo':
      return (
        <header className="relative text-center">
          {hasImage && (
            <div className="relative mb-2 h-36 overflow-hidden pm-wide:mx-6 pm-wide:mt-6 pm-wide:h-48 pm-wide:rounded-[2rem]">
              <Backdrop theme={theme} />
            </div>
          )}
          <ShareButton onShare={onShare} glass={hasImage} className="absolute top-4 right-4 pm-wide:top-9 pm-wide:right-9" />
          <div className={clsx('px-4', hasImage ? 'pt-4' : 'pt-10')}>
            <BrandMark menu={menu} theme={theme} className="mx-auto" />
            <p className="mt-5 text-[0.7rem] font-semibold tracking-[0.35em] text-(--pm-primary) uppercase">Menú de hoy</p>
            <h1 className="mt-1.5 text-[2.1rem] leading-tight pm-wide:text-5xl" style={heading}>
              {b.name}
            </h1>
            {tagline && <p className="mt-1.5 text-(--pm-muted) italic">{tagline}</p>}
            <div className="mx-auto mt-5 flex items-center justify-center gap-3 text-(--pm-primary)" aria-hidden>
              <span className="h-px w-14 bg-current opacity-40" />
              <span className="size-1.5 rotate-45 bg-current" />
              <span className="h-px w-14 bg-current opacity-40" />
            </div>
          </div>
        </header>
      )
    default:
      return (
        <header className="px-4 pt-4 pm-wide:px-6 pm-wide:pt-6">
          {hasImage && (
            <div className="relative mb-4 h-36 overflow-hidden rounded-3xl pm-wide:h-48">
              <Backdrop theme={theme} />
            </div>
          )}
          <div className="flex items-center gap-3.5">
            <BrandMark menu={menu} theme={theme} className="size-14" />
            <div className="min-w-0 flex-1">
              <h1 className="text-[1.4rem] leading-tight font-bold tracking-tight" style={heading}>
                {b.name}
              </h1>
              {tagline && <p className="mt-0.5 text-sm text-(--pm-muted)">{tagline}</p>}
            </div>
            <ShareButton onShare={onShare} />
          </div>
        </header>
      )
  }
}

/** ADR 0058: what the customer wants to know before ordering — open or not, delivery and its fee, pickup, minimum. */
function InfoStrip({ menu, theme }: { menu: PublicMenu; theme: ResolvedTheme }) {
  const o = menu.ordering
  const open = openLabel(menu.business.openState)
  const chip = 'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-(--pm-surface) px-3 py-1.5 text-xs font-medium whitespace-nowrap ring-1 ring-(--pm-border)'
  const items = [
    theme.header.showHours && open.text ? (
      <li key="open" className={chip}>
        <span className={clsx('size-2 rounded-full', open.open ? 'bg-emerald-500' : 'bg-red-500')} aria-hidden />
        {open.text}
      </li>
    ) : null,
    o.enabled && o.delivery ? (
      <li key="delivery" className={chip}>
        <Bike size={14} className="text-(--pm-primary)" aria-hidden />
        {o.deliveryFee > 0 ? `Domicilio ${formatMoney(o.deliveryFee)}` : 'Domicilio gratis'}
      </li>
    ) : null,
    o.enabled && o.pickup ? (
      <li key="pickup" className={chip}>
        <Store size={14} className="text-(--pm-primary)" aria-hidden />
        Para recoger
      </li>
    ) : null,
    o.enabled && o.minOrder > 0 ? (
      <li key="min" className={chip}>
        <Wallet size={14} className="text-(--pm-primary)" aria-hidden />
        Mínimo {formatMoney(o.minOrder)}
      </li>
    ) : null,
  ].filter(Boolean)
  if (!items.length) return null
  const centered = theme.header.style === 'centered' || theme.header.style === 'logo'
  return (
    <ul aria-label="Información del pedido" className={clsx('flex gap-2 overflow-x-auto px-4 pt-5 pb-1 [scrollbar-width:none] pm-wide:px-6', centered && 'pm-wide:justify-center')}>
      {items}
    </ul>
  )
}

function CategoryNav({ theme, categories, active, onGo }: { theme: ResolvedTheme; categories: string[]; active: string | null; onGo: (c: string) => void }) {
  const ref = useRef<HTMLElement>(null)
  // The active chip stays in sight while the page scrolls (only the bar moves, never the page).
  useEffect(() => {
    const nav = ref.current
    const chip = active ? nav?.querySelector<HTMLElement>(`[data-nav="${CSS.escape(active)}"]`) : null
    if (nav && chip) nav.scrollTo?.({ left: chip.offsetLeft - nav.clientWidth / 2 + chip.clientWidth / 2, behavior: 'smooth' })
  }, [active])
  if (theme.nav === 'none') return null
  const shell = 'sticky top-0 z-10 mt-4 bg-(--pm-bg)/85 px-4 py-3 backdrop-blur-md pm-wide:px-6'
  if (theme.nav === 'select') {
    return (
      <nav aria-label="Categorías" className={shell}>
        <select
          aria-label="Ir a la categoría"
          value={active ?? ''}
          onChange={(e) => e.target.value && onGo(e.target.value)}
          style={btnRadius}
          className="w-full border border-(--pm-border) bg-(--pm-surface) px-3 py-2.5 text-sm font-medium text-(--pm-text)"
        >
          <option value="">Categorías</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </nav>
    )
  }
  if (theme.nav === 'tabs') {
    return (
      <nav ref={ref} aria-label="Categorías" className={clsx(shell, 'flex gap-6 overflow-x-auto border-b border-(--pm-border) pb-0 [scrollbar-width:none]')}>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            data-nav={c}
            onClick={() => onGo(c)}
            aria-current={active === c ? 'true' : undefined}
            className={clsx(
              'shrink-0 border-b-2 pb-2.5 text-sm whitespace-nowrap transition-colors',
              active === c ? 'border-(--pm-primary) font-semibold text-(--pm-text)' : 'border-transparent text-(--pm-muted) hover:text-(--pm-text)',
            )}
          >
            {c}
          </button>
        ))}
      </nav>
    )
  }
  return (
    <nav ref={ref} aria-label="Categorías" className={clsx(shell, 'flex gap-2 overflow-x-auto [scrollbar-width:none]')}>
      {categories.map((c) => (
        <button
          key={c}
          type="button"
          data-nav={c}
          onClick={() => onGo(c)}
          aria-current={active === c ? 'true' : undefined}
          style={btnRadius}
          className={clsx(
            'shrink-0 px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors',
            active === c ? 'bg-(--pm-text) text-(--pm-bg)' : 'bg-(--pm-surface) text-(--pm-text) ring-1 ring-(--pm-border) hover:bg-(--pm-soft)',
          )}
        >
          {c}
        </button>
      ))}
    </nav>
  )
}

function CategoryTitle({ theme, name, count }: { theme: ResolvedTheme; name: string; count: number }) {
  const id = `cat-${name}`
  if (theme.cards.layout === 'menu')
    return (
      <div className="mb-5 flex items-center gap-4 text-(--pm-primary)">
        <span className="h-px flex-1 bg-current opacity-30" aria-hidden />
        <h2 id={id} className="text-center text-lg tracking-[0.2em] text-(--pm-text) uppercase" style={heading}>
          {name}
        </h2>
        <span className="h-px flex-1 bg-current opacity-30" aria-hidden />
      </div>
    )
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-[1.35rem] leading-tight font-bold tracking-tight pm-wide:text-2xl" style={heading}>
        {name}
      </h2>
      <span className="shrink-0 text-xs text-(--pm-muted)">
        {count} {count === 1 ? 'plato' : 'platos'}
      </span>
    </div>
  )
}

type QtyProps = {
  quantity: (item: PublicMenuItem) => number
  onQuantity: (item: PublicMenuItem) => (q: number) => void
  /** ADR 0059: a dish with options opens its sheet instead of adding at once. */
  onConfigure: (item: PublicMenuItem) => () => void
}

function DishList({ theme, items, quantity, onQuantity, onConfigure }: { theme: ResolvedTheme; items: PublicMenuItem[] } & QtyProps) {
  const layout = theme.cards.layout
  if (layout === 'grid')
    return (
      <ul className="grid grid-cols-2 gap-3 pm-wide:grid-cols-3 pm-wide:gap-4">
        {items.map((item) => (
          <GridCard key={item.id} theme={theme} item={item} quantity={quantity(item)} onQuantity={onQuantity(item)} onConfigure={onConfigure(item)} />
        ))}
      </ul>
    )
  if (layout === 'carousel')
    return (
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] pm-wide:-mx-6 pm-wide:px-6">
        {items.map((item) => (
          <li key={item.id} className="w-[78%] shrink-0 snap-start pm-wide:w-72">
            <GridCard theme={theme} item={item} quantity={quantity(item)} onQuantity={onQuantity(item)} onConfigure={onConfigure(item)} as="div" />
          </li>
        ))}
      </ul>
    )
  if (layout === 'menu')
    return (
      <ol className="divide-y divide-(--pm-border)">
        {items.map((item, i) => (
          <MenuLine key={item.id} theme={theme} n={i + 1} item={item} quantity={quantity(item)} onQuantity={onQuantity(item)} onConfigure={onConfigure(item)} />
        ))}
      </ol>
    )
  if (layout === 'large')
    return (
      <ul className="grid gap-4 pm-wide:grid-cols-2">
        {items.map((item) => (
          <LargeCard key={item.id} theme={theme} item={item} quantity={quantity(item)} onQuantity={onQuantity(item)} onConfigure={onConfigure(item)} />
        ))}
      </ul>
    )
  return (
    <ul className={clsx('grid pm-wide:grid-cols-2', layout === 'compact' ? 'gap-2' : 'gap-3 pm-wide:gap-4')}>
      {items.map((item) => (
        <ListCard key={item.id} theme={theme} item={item} quantity={quantity(item)} onQuantity={onQuantity(item)} onConfigure={onConfigure(item)} compact={layout === 'compact'} />
      ))}
    </ul>
  )
}

type CardProps = { theme: ResolvedTheme; item: PublicMenuItem; quantity: number; onQuantity: (q: number) => void; onConfigure: () => void }

const hasPhoto = (theme: ResolvedTheme, item: PublicMenuItem) => theme.cards.image === 'show' && !!item.imagePath

function Description({ theme, text, className }: { theme: ResolvedTheme; text: string | null; className?: string }) {
  if (!text || theme.cards.description === 'hide') return null
  return <p className={clsx('text-sm leading-relaxed text-(--pm-muted)', theme.cards.description === 'clamp' && 'line-clamp-2', className)}>{text}</p>
}

function Price({ item, className }: { item: PublicMenuItem; className?: string }) {
  return (
    <p className={clsx('flex flex-wrap items-baseline gap-x-1.5 tabular-nums', className)}>
      <span className="font-bold text-(--pm-price)">{formatMoney(item.price)}</span>
      {item.regularPrice && (
        <>
          <span className="text-xs text-(--pm-muted) line-through">{formatMoney(item.regularPrice)}</span>
          <span className="rounded-full bg-(--pm-primary)/12 px-1.5 py-0.5 text-[0.65rem] font-bold tracking-wide text-(--pm-primary) uppercase">Oferta</span>
        </>
      )}
    </p>
  )
}

/** ADR 0059: a configurable dish says what is chosen. */
function Choices({ item }: { item: PublicMenuItem }) {
  const groups = item.groups ?? []
  if (!groups.length) return null
  const names = groups.map((g) => g.name)
  return <p className="mt-1 text-xs text-(--pm-muted)">Elige: {names.slice(0, 4).join(' · ')}{names.length > 4 ? '…' : ''}</p>
}

function Label({ item }: { item: PublicMenuItem }) {
  const label = availabilityLabel(item)
  if (!label) return null
  return <p className={clsx('mt-1 text-xs font-semibold', item.availability === 'available' ? 'text-(--pm-primary)' : 'text-(--pm-muted)')}>{label}</p>
}

/** A dish photo — only when there is one (ADR 0058: no empty placeholders). */
function DishImage({ theme, item, className }: { theme: ResolvedTheme; item: PublicMenuItem; className: string }) {
  if (!item.imagePath) return null
  return <img src={productImageUrl(item.imagePath)} alt="" loading="lazy" className={clsx('shrink-0 object-cover', IMAGE_SHAPE[theme.cards.imageShape], className)} />
}

/** Add / quantity: a round «+», then «− 2 +» (cart logic of ADR 0052). The same control in every layout. */
function QuantityControl({
  item,
  quantity,
  onQuantity,
  onConfigure,
  size = 'md',
}: {
  item: PublicMenuItem
  quantity: number
  onQuantity: (q: number) => void
  onConfigure: () => void
  size?: 'sm' | 'md'
}) {
  if (item.availability !== 'available') return null
  const atMax = item.remaining !== null && quantity >= item.remaining
  const dim = size === 'sm' ? 'size-8' : 'size-9'
  if ((item.groups?.length ?? 0) > 0)
    return (
      <span className="relative shrink-0">
        <button
          type="button"
          onClick={onConfigure}
          disabled={atMax}
          style={btnRadius}
          className={clsx('flex items-center justify-center shadow-[0_6px_16px_-6px_rgba(0,0,0,0.45)]', dim, primaryBtn)}
          aria-label={`Agregar ${item.name}`}
        >
          <Plus size={size === 'sm' ? 16 : 18} strokeWidth={2.6} aria-hidden />
        </button>
        {quantity > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex min-w-5 items-center justify-center rounded-full bg-(--pm-text) px-1 text-[0.65rem] font-bold text-(--pm-bg) tabular-nums" aria-label={`${quantity} en tu pedido`}>
            {quantity}
          </span>
        )}
      </span>
    )
  if (quantity === 0)
    return (
      <button
        type="button"
        onClick={() => onQuantity(1)}
        style={btnRadius}
        className={clsx('flex shrink-0 items-center justify-center shadow-[0_6px_16px_-6px_rgba(0,0,0,0.45)]', dim, primaryBtn)}
        aria-label={`Agregar ${item.name}`}
      >
        <Plus size={size === 'sm' ? 16 : 18} strokeWidth={2.6} aria-hidden />
      </button>
    )
  return (
    <span className="flex shrink-0 items-center gap-1 bg-(--pm-surface) p-1 shadow-[0_6px_16px_-8px_rgba(0,0,0,0.4)] ring-1 ring-(--pm-border)" style={btnRadius}>
      <button type="button" onClick={() => onQuantity(quantity - 1)} className="flex size-7 items-center justify-center rounded-full bg-(--pm-soft)" aria-label={`Quitar un ${item.name}`}>
        <Minus size={14} strokeWidth={2.6} aria-hidden />
      </button>
      <span className="min-w-5 text-center text-sm font-bold tabular-nums" aria-live="polite">
        {quantity}
      </span>
      <button type="button" onClick={() => onQuantity(quantity + 1)} disabled={atMax} className={clsx('flex size-7 items-center justify-center rounded-full', primaryBtn)} aria-label={`Agregar otro ${item.name}`}>
        <Plus size={14} strokeWidth={2.6} aria-hidden />
      </button>
    </span>
  )
}

function ListCard({ theme, item, quantity, onQuantity, onConfigure, compact }: CardProps & { compact: boolean }) {
  const photo = !compact && hasPhoto(theme, item)
  const position = theme.cards.imagePosition
  // Elegante: the name, a dotted leader and the price on one line, as on a fine menu.
  const leader = theme.template === 'elegant' && !compact
  const unavailable = item.availability !== 'available'
  return (
    <li
      className={clsx(
        'relative flex gap-4 rounded-2xl',
        compact ? 'items-center px-4 py-3' : 'p-4',
        photo && position === 'top' && 'flex-col',
        CARD_STYLE[theme.cards.style],
        unavailable && 'opacity-55',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {leader ? (
          <div className="flex items-center gap-2">
            <h3 className="text-[1.05rem] leading-snug font-semibold" style={heading}>
              {item.name}
            </h3>
            <span className="min-w-4 flex-1 translate-y-[0.3em] self-center border-b border-dotted border-(--pm-muted)/60" aria-hidden />
            <Price item={item} />
            {!photo && <QuantityControl item={item} quantity={quantity} onQuantity={onQuantity} onConfigure={onConfigure} size="sm" />}
          </div>
        ) : (
          <h3 className="text-[1.02rem] leading-snug font-semibold" style={heading}>
            {item.name}
          </h3>
        )}
        {!compact && <Description theme={theme} text={item.description} className="mt-1" />}
        <Choices item={item} />
        <Label item={item} />
        {!leader && (
          <div className={clsx('flex items-center justify-between gap-3', !compact && 'mt-auto pt-3')}>
            <Price item={item} />
            {!photo && <QuantityControl item={item} quantity={quantity} onQuantity={onQuantity} onConfigure={onConfigure} size={compact ? 'sm' : 'md'} />}
          </div>
        )}
      </div>
      {photo && (
        <div className={clsx('relative shrink-0 self-start', position === 'left' && 'order-first', position === 'top' && 'order-first w-full')}>
          <DishImage theme={theme} item={item} className={position === 'top' ? 'aspect-[16/9] w-full' : 'size-28'} />
          <div className="absolute -right-1.5 -bottom-1.5">
            <QuantityControl item={item} quantity={quantity} onQuantity={onQuantity} onConfigure={onConfigure} />
          </div>
        </div>
      )}
    </li>
  )
}

function GridCard({ theme, item, quantity, onQuantity, onConfigure, as = 'li' }: CardProps & { as?: 'li' | 'div' }) {
  const Tag = as
  const photo = hasPhoto(theme, item)
  const circle = theme.cards.imageShape === 'circle'
  return (
    <Tag className={clsx('flex h-full flex-col overflow-hidden rounded-2xl', CARD_STYLE[theme.cards.style], item.availability !== 'available' && 'opacity-55')}>
      {photo && (
        <div className={clsx('relative', circle && 'px-6 pt-4')}>
          <DishImage theme={theme} item={item} className={clsx(circle ? 'aspect-square w-full' : 'aspect-[4/3] w-full rounded-none')} />
          <div className="absolute right-2.5 bottom-2.5">
            <QuantityControl item={item} quantity={quantity} onQuantity={onQuantity} onConfigure={onConfigure} size="sm" />
          </div>
        </div>
      )}
      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="leading-snug font-semibold" style={heading}>
          {item.name}
        </h3>
        <Description theme={theme} text={item.description} className="mt-1" />
        <Choices item={item} />
        <Label item={item} />
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <Price item={item} />
          {!photo && <QuantityControl item={item} quantity={quantity} onQuantity={onQuantity} onConfigure={onConfigure} size="sm" />}
        </div>
      </div>
    </Tag>
  )
}

function LargeCard({ theme, item, quantity, onQuantity, onConfigure }: CardProps) {
  const photo = hasPhoto(theme, item)
  return (
    <li className={clsx('flex flex-col overflow-hidden rounded-3xl', CARD_STYLE[theme.cards.style], item.availability !== 'available' && 'opacity-55')}>
      {photo ? (
        <div className="relative aspect-[16/10] w-full bg-cover bg-center" style={{ backgroundImage: `url("${productImageUrl(item.imagePath!)}")` }}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <h3 className="text-2xl leading-tight font-semibold" style={heading}>
              {item.name}
            </h3>
            {theme.cards.description !== 'hide' && item.description && (
              <p className={clsx('mt-1 text-sm text-white/80', theme.cards.description === 'clamp' && 'line-clamp-2')}>{item.description}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="px-5 pt-5">
          <h3 className="text-[1.4rem] leading-tight font-semibold" style={heading}>
            {item.name}
          </h3>
          <Description theme={theme} text={item.description} className="mt-1.5" />
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 p-5 pt-4">
        <div>
          <Price item={item} className="text-lg" />
          <Choices item={item} />
          <Label item={item} />
        </div>
        <QuantityControl item={item} quantity={quantity} onQuantity={onQuantity} onConfigure={onConfigure} />
      </div>
    </li>
  )
}

function MenuLine({ theme, n, item, quantity, onQuantity, onConfigure }: CardProps & { n: number }) {
  return (
    <li className={clsx('py-4 first:pt-0', item.availability !== 'available' && 'opacity-55')}>
      <div className="flex items-baseline gap-3">
        <span className="w-6 shrink-0 text-sm text-(--pm-primary) tabular-nums" style={heading}>
          {String(n).padStart(2, '0')}
        </span>
        <h3 className="text-[1.1rem] leading-snug font-semibold" style={heading}>
          {item.name}
        </h3>
        <span className="min-w-4 flex-1 translate-y-[-0.3em] border-b border-dotted border-(--pm-muted)/60" aria-hidden />
        <Price item={item} />
        <span className="self-center">
          <QuantityControl item={item} quantity={quantity} onQuantity={onQuantity} onConfigure={onConfigure} size="sm" />
        </span>
      </div>
      <div className="mt-1 pr-11 pl-9">
        <Description theme={theme} text={item.description} className="italic" />
        <Label item={item} />
      </div>
    </li>
  )
}
