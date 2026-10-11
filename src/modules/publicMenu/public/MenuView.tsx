import { productImageUrl } from '@/modules/products/lib/productImages'
import { AccountIcon } from '@/shared/avatars/Avatar'
import { formatMoney } from '@/shared/utils/format'
import { whatsappLink } from '@/shared/utils/whatsapp'
import clsx from 'clsx'
import { Clock, Minus, Plus, Share2, ShoppingBag, UtensilsCrossed } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { availabilityLabel, byCategory, cartStorageKey, cartTotals, openLabel, publicMenuUrl, quantityOf, setQuantity, shareText } from '../lib/cart'
import type { ResolvedTheme } from '../lib/themes'
import type { CartLine, PublicMenu, PublicMenuItem } from '../types'
import { CartSheet } from './CartSheet'

function readCart(key: string): CartLine[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : []
    return Array.isArray(parsed) ? parsed.filter((l) => typeof l.productId === 'string' && l.quantity > 0) : []
  } catch {
    return []
  }
}

const heading: CSSProperties = { fontFamily: 'var(--pm-font-heading)' }
const btnRadius: CSSProperties = { borderRadius: 'var(--pm-btn-radius)' }
const primaryBtn = 'bg-(--pm-primary) text-(--pm-on-primary) font-semibold transition hover:opacity-90 disabled:opacity-40'

const CARD_STYLE: Record<ResolvedTheme['cards']['style'], string> = {
  flat: 'bg-(--pm-surface)',
  shadow: 'bg-(--pm-surface) shadow-sm ring-1 ring-(--pm-border)',
  outline: 'border border-(--pm-border)',
  rough: 'bg-(--pm-surface) border-2 border-(--pm-border) [border-radius:255px_12px_225px_12px/12px_225px_12px_255px]',
  glass: 'bg-(--pm-surface)/70 ring-1 ring-(--pm-border) backdrop-blur',
}
const IMAGE_SHAPE: Record<ResolvedTheme['cards']['imageShape'], string> = { square: 'rounded-none', rounded: 'rounded-xl', circle: 'rounded-full' }

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
  const key = cartStorageKey(slug, menu.today)
  const [lines, setLines] = useState<CartLine[]>(() => (mode === 'live' ? readCart(key) : []))
  const [cartOpen, setCartOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const sections = useRef(new Map<string, HTMLElement>())

  useEffect(() => {
    if (mode !== 'live') return
    try {
      if (lines.length) localStorage.setItem(key, JSON.stringify(lines))
      else localStorage.removeItem(key)
    } catch {
      // A private window may block storage: the cart still works in memory.
    }
  }, [key, lines, mode])

  const groups = useMemo(() => byCategory(menu.items), [menu.items])
  const totals = cartTotals(lines, menu, null)
  const url = publicMenuUrl(slug)
  const framed = theme.header.style === 'logo'

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

  return (
    <div className={clsx('mx-auto max-w-3xl pb-28', framed && 'px-3 pt-3')}>
      <div className={clsx(framed && 'border-4 border-double border-(--pm-primary)/40 px-1 pb-6')}>
        <MenuHeader menu={menu} theme={theme} onShare={() => void share()} />

        {menu.business.message && (
          <p className="mx-4 mb-3 rounded-xl bg-(--pm-primary)/10 px-4 py-2.5 text-sm ring-1 ring-(--pm-primary)/25">{menu.business.message}</p>
        )}
        {!menu.ordering.enabled && menu.items.length > 0 && (
          <p className="mx-4 mb-3 rounded-xl bg-(--pm-surface) px-4 py-2.5 text-sm ring-1 ring-(--pm-border)">Arma tu pedido y envíalo por WhatsApp al negocio.</p>
        )}

        {menu.items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Clock size={28} className="mx-auto text-(--pm-muted)" aria-hidden />
            <p className="mt-3 font-medium" style={heading}>
              Hoy no hay menú publicado
            </p>
            <p className="mt-1 text-sm text-(--pm-muted)">Vuelve más tarde o escríbele al negocio.</p>
          </div>
        ) : (
          <>
            {groups.length > 1 && <CategoryNav theme={theme} categories={groups.map((g) => g.category)} active={activeCategory} onGo={goTo} />}
            <main className="space-y-8 px-4 pt-4">
              {groups.map((g) => (
                <section
                  key={g.category}
                  ref={(el) => {
                    if (el) sections.current.set(g.category, el)
                  }}
                  className="scroll-mt-16"
                  aria-labelledby={`cat-${g.category}`}
                >
                  <CategoryTitle theme={theme} name={g.category} />
                  <DishList theme={theme} items={g.items} quantity={quantity} onQuantity={onQuantity} />
                </section>
              ))}
            </main>
          </>
        )}

        <footer className="px-4 pt-10 text-center text-xs text-(--pm-muted)">
          <a href="https://quanela.com">Hecho con Quanela</a>
        </footer>
      </div>

      {totals.units > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            style={btnRadius}
            className={clsx('mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 py-4 shadow-xl', primaryBtn)}
          >
            <span className="flex items-center gap-2">
              <ShoppingBag size={18} aria-hidden /> Ver pedido · {totals.units}
            </span>
            <span className="tabular-nums">{formatMoney(totals.subtotal)}</span>
          </button>
        </div>
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

function OpenBadge({ menu, light = false }: { menu: PublicMenu; light?: boolean }) {
  const open = openLabel(menu.business.openState)
  if (!open.text) return null
  return (
    <p className={clsx('inline-flex items-center gap-1.5 text-xs font-medium', light ? 'text-white/90' : open.open ? 'text-emerald-600' : 'text-red-500')}>
      <span className={clsx('size-2 rounded-full', open.open ? 'bg-emerald-500' : 'bg-red-500')} aria-hidden />
      {open.text}
    </p>
  )
}

function ShareButton({ onShare, className }: { onShare: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onShare}
      className={clsx('flex size-10 shrink-0 items-center justify-center rounded-full bg-(--pm-surface) text-(--pm-text) shadow-sm ring-1 ring-(--pm-border) hover:opacity-90', className)}
      aria-label="Compartir el menú"
    >
      <Share2 size={18} aria-hidden />
    </button>
  )
}

function MenuHeader({ menu, theme, onShare }: { menu: PublicMenu; theme: ResolvedTheme; onShare: () => void }) {
  const b = menu.business
  const tagline = theme.header.showTagline && b.tagline
  const hours = theme.header.showHours
  switch (theme.header.style) {
    case 'cover':
      return (
        <header className="relative mb-4 pm-wide:mx-4 pm-wide:mt-4 pm-wide:overflow-hidden pm-wide:rounded-3xl">
          <div
            className="h-44 w-full bg-cover bg-center pm-wide:h-56"
            style={{
              backgroundImage: theme.header.cover
                ? `linear-gradient(180deg, transparent 30%, rgba(0,0,0,.65)), url("${productImageUrl(theme.header.cover)}")`
                : 'linear-gradient(135deg, var(--pm-primary), color-mix(in srgb, var(--pm-primary) 55%, black))',
            }}
          />
          <ShareButton onShare={onShare} className="absolute top-4 right-4" />
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 px-4 pb-4 text-white">
            <AccountIcon iconKey={b.iconKey} seed={b.slug} size="lg" className="rounded-2xl ring-2 ring-white/80" />
            <div className="min-w-0">
              <h1 className="text-2xl leading-tight font-bold drop-shadow" style={heading}>
                {b.name}
              </h1>
              {tagline && <p className="text-sm text-white/85">{b.tagline}</p>}
              {hours && <OpenBadge menu={menu} light />}
            </div>
          </div>
        </header>
      )
    case 'centered':
      return (
        <header className="relative px-4 pt-8 pb-5 text-center">
          <ShareButton onShare={onShare} className="absolute top-4 right-4" />
          <AccountIcon iconKey={b.iconKey} seed={b.slug} size="lg" className="mx-auto rounded-2xl" />
          <h1 className="mt-3 text-3xl leading-tight font-semibold" style={heading}>
            {b.name}
          </h1>
          {tagline && <p className="mt-1 text-(--pm-muted)">{b.tagline}</p>}
          {hours && (
            <div className="mt-2">
              <OpenBadge menu={menu} />
            </div>
          )}
          <span className="mx-auto mt-4 block h-px w-16 bg-(--pm-primary)" aria-hidden />
        </header>
      )
    case 'logo':
      return (
        <header className="relative px-4 pt-8 pb-4 text-center">
          <ShareButton onShare={onShare} className="absolute top-3 right-3" />
          <AccountIcon iconKey={b.iconKey} seed={b.slug} size="lg" className="mx-auto rounded-full" />
          <p className="mt-3 text-(--pm-primary)" aria-hidden>
            ❦
          </p>
          <h1 className="text-3xl tracking-wide uppercase" style={{ ...heading, fontVariant: 'small-caps' }}>
            {b.name}
          </h1>
          {tagline && <p className="mt-1 text-(--pm-muted) italic">{b.tagline}</p>}
          <p className="mt-2 text-xs tracking-[0.3em] text-(--pm-muted) uppercase">— Menú del día —</p>
          {hours && (
            <div className="mt-2">
              <OpenBadge menu={menu} />
            </div>
          )}
        </header>
      )
    default:
      return (
        <header className="flex items-start gap-3 px-4 pt-6 pb-4">
          <AccountIcon iconKey={b.iconKey} seed={b.slug} size="lg" className="rounded-2xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl leading-tight font-bold" style={heading}>
              {b.name}
            </h1>
            {tagline && <p className="mt-0.5 text-sm text-(--pm-muted)">{b.tagline}</p>}
            {hours && (
              <div className="mt-1.5">
                <OpenBadge menu={menu} />
              </div>
            )}
          </div>
          <ShareButton onShare={onShare} />
        </header>
      )
  }
}

function CategoryNav({ theme, categories, active, onGo }: { theme: ResolvedTheme; categories: string[]; active: string | null; onGo: (c: string) => void }) {
  if (theme.nav === 'none') return null
  const shell = 'sticky top-0 z-10 bg-(--pm-bg)/90 px-4 py-2.5 backdrop-blur'
  if (theme.nav === 'select') {
    return (
      <nav aria-label="Categorías" className={shell}>
        <select
          aria-label="Ir a la categoría"
          value={active ?? ''}
          onChange={(e) => e.target.value && onGo(e.target.value)}
          style={btnRadius}
          className="w-full border border-(--pm-border) bg-(--pm-surface) px-3 py-2 text-sm text-(--pm-text)"
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
      <nav aria-label="Categorías" className={clsx(shell, 'flex gap-5 overflow-x-auto border-b border-(--pm-border) [scrollbar-width:none]')}>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onGo(c)}
            className={clsx('shrink-0 border-b-2 pb-1 text-sm whitespace-nowrap', active === c ? 'border-(--pm-primary) font-semibold text-(--pm-text)' : 'border-transparent text-(--pm-muted)')}
            style={heading}
          >
            {c}
          </button>
        ))}
      </nav>
    )
  }
  return (
    <nav aria-label="Categorías" className={clsx(shell, 'flex gap-2 overflow-x-auto [scrollbar-width:none]')}>
      {categories.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onGo(c)}
          style={btnRadius}
          className={clsx(
            'shrink-0 px-3.5 py-1.5 text-sm font-medium whitespace-nowrap ring-1',
            active === c ? 'bg-(--pm-primary) text-(--pm-on-primary) ring-(--pm-primary)' : 'bg-(--pm-surface) text-(--pm-text) ring-(--pm-border)',
          )}
        >
          {c}
        </button>
      ))}
    </nav>
  )
}

function CategoryTitle({ theme, name }: { theme: ResolvedTheme; name: string }) {
  const id = `cat-${name}`
  if (theme.cards.layout === 'menu')
    return (
      <h2 id={id} className="mb-3 text-center text-xl tracking-widest uppercase" style={heading}>
        <span className="text-(--pm-primary)">— </span>
        {name}
        <span className="text-(--pm-primary)"> —</span>
      </h2>
    )
  return (
    <h2 id={id} className={clsx('mb-3 font-semibold', theme.template === 'artisan' ? 'text-3xl' : 'text-lg')} style={heading}>
      {name}
    </h2>
  )
}

type QtyProps = { quantity: (item: PublicMenuItem) => number; onQuantity: (item: PublicMenuItem) => (q: number) => void }

function DishList({ theme, items, quantity, onQuantity }: { theme: ResolvedTheme; items: PublicMenuItem[] } & QtyProps) {
  const layout = theme.cards.layout
  if (layout === 'grid')
    return (
      <ul className="grid grid-cols-2 gap-3 pm-wide:grid-cols-3">
        {items.map((item) => (
          <GridCard key={item.id} theme={theme} item={item} quantity={quantity(item)} onQuantity={onQuantity(item)} />
        ))}
      </ul>
    )
  if (layout === 'carousel')
    return (
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
        {items.map((item) => (
          <li key={item.id} className="w-[72%] shrink-0 snap-start pm-wide:w-64">
            <GridCard theme={theme} item={item} quantity={quantity(item)} onQuantity={onQuantity(item)} as="div" />
          </li>
        ))}
      </ul>
    )
  if (layout === 'menu')
    return (
      <ol className="space-y-4">
        {items.map((item, i) => (
          <MenuLine key={item.id} theme={theme} n={i + 1} item={item} quantity={quantity(item)} onQuantity={onQuantity(item)} />
        ))}
      </ol>
    )
  return (
    <ul className={layout === 'large' ? 'grid gap-4 pm-wide:grid-cols-2' : 'space-y-2.5'}>
      {items.map((item) =>
        layout === 'large' ? (
          <LargeCard key={item.id} theme={theme} item={item} quantity={quantity(item)} onQuantity={onQuantity(item)} />
        ) : (
          <ListCard key={item.id} theme={theme} item={item} quantity={quantity(item)} onQuantity={onQuantity(item)} compact={layout === 'compact'} />
        ),
      )}
    </ul>
  )
}

type CardProps = { theme: ResolvedTheme; item: PublicMenuItem; quantity: number; onQuantity: (q: number) => void }

function Description({ theme, text, className }: { theme: ResolvedTheme; text: string | null; className?: string }) {
  if (!text || theme.cards.description === 'hide') return null
  return <p className={clsx('text-sm text-(--pm-muted)', theme.cards.description === 'clamp' && 'line-clamp-2', className)}>{text}</p>
}

function Price({ item, className }: { item: PublicMenuItem; className?: string }) {
  return (
    <p className={clsx('tabular-nums', className)}>
      <span className="font-semibold text-(--pm-price)">{formatMoney(item.price)}</span>
      {item.regularPrice && <span className="ml-1.5 text-xs text-(--pm-muted) line-through">{formatMoney(item.regularPrice)}</span>}
    </p>
  )
}

function Label({ item }: { item: PublicMenuItem }) {
  const label = availabilityLabel(item)
  if (!label) return null
  return <p className={clsx('text-xs font-medium', item.availability === 'available' ? 'text-(--pm-primary)' : 'text-(--pm-muted)')}>{label}</p>
}

function DishImage({ theme, item, className }: { theme: ResolvedTheme; item: PublicMenuItem; className: string }) {
  const shape = IMAGE_SHAPE[theme.cards.imageShape]
  return item.imagePath ? (
    <img src={productImageUrl(item.imagePath)} alt="" loading="lazy" className={clsx('shrink-0 object-cover', shape, className)} />
  ) : (
    <span className={clsx('flex shrink-0 items-center justify-center bg-gradient-to-br from-(--pm-primary)/15 to-(--pm-soft) text-(--pm-primary)/60', shape, className)}>
      <UtensilsCrossed size={24} aria-hidden />
    </span>
  )
}

/** Add / quantity: the same control in every layout (cart logic of ADR 0052). */
function QuantityControl({ item, quantity, onQuantity, size = 'md' }: { item: PublicMenuItem; quantity: number; onQuantity: (q: number) => void; size?: 'sm' | 'md' }) {
  if (item.availability !== 'available') return null
  const atMax = item.remaining !== null && quantity >= item.remaining
  if (quantity === 0)
    return (
      <button
        type="button"
        onClick={() => onQuantity(1)}
        style={btnRadius}
        className={clsx(primaryBtn, size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm')}
        aria-label={`Agregar ${item.name}`}
      >
        Agregar
      </button>
    )
  return (
    <span className="flex items-center gap-1 bg-(--pm-soft) p-1" style={btnRadius}>
      <button type="button" onClick={() => onQuantity(quantity - 1)} className="flex size-8 items-center justify-center rounded-full bg-(--pm-surface) shadow-sm" aria-label={`Quitar un ${item.name}`}>
        <Minus size={15} aria-hidden />
      </button>
      <span className="min-w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {quantity}
      </span>
      <button type="button" onClick={() => onQuantity(quantity + 1)} disabled={atMax} className={clsx('flex size-8 items-center justify-center rounded-full', primaryBtn)} aria-label={`Agregar otro ${item.name}`}>
        <Plus size={15} aria-hidden />
      </button>
    </span>
  )
}

function ListCard({ theme, item, quantity, onQuantity, compact }: CardProps & { compact: boolean }) {
  const showImage = !compact && theme.cards.image === 'show'
  const right = theme.cards.imagePosition === 'right'
  const top = theme.cards.imagePosition === 'top'
  // Elegante: the name, a dotted leader and the price on one line, as on a printed menu.
  const leader = theme.template === 'elegant' && !compact
  const price = <Price item={item} className={theme.cards.style === 'rough' ? 'rotate-[-2deg] rounded-md border border-dashed border-(--pm-price) px-1.5' : undefined} />
  return (
    <li
      className={clsx(
        'flex gap-3 rounded-2xl',
        compact ? 'items-center px-3 py-2.5' : 'p-3',
        showImage && top && 'flex-col',
        CARD_STYLE[theme.cards.style],
        item.availability !== 'available' && 'opacity-60',
      )}
    >
      {showImage && <DishImage theme={theme} item={item} className={clsx(top ? (theme.cards.imageShape === 'circle' ? 'mx-auto size-32' : 'aspect-[16/9] w-full') : 'size-24', right && !top && 'order-last')} />}
      <div className="flex min-w-0 flex-1 flex-col">
        {leader ? (
          <div className="flex items-baseline gap-2">
            <h3 className="leading-snug font-semibold" style={heading}>
              {item.name}
            </h3>
            <span className="min-w-4 flex-1 translate-y-[-0.25em] border-b border-dotted border-(--pm-muted)" aria-hidden />
            {price}
          </div>
        ) : (
          <h3 className={clsx('leading-snug font-semibold', theme.template === 'artisan' && 'text-xl')} style={heading}>
            {item.name}
          </h3>
        )}
        {!compact && <Description theme={theme} text={item.description} className="mt-0.5" />}
        <Label item={item} />
        <div className={clsx('flex flex-wrap items-end gap-2', leader ? 'justify-end' : 'justify-between', !compact && 'mt-auto pt-2')}>
          {!leader && price}
          <QuantityControl item={item} quantity={quantity} onQuantity={onQuantity} size={compact ? 'sm' : 'md'} />
        </div>
      </div>
    </li>
  )
}

function GridCard({ theme, item, quantity, onQuantity, as = 'li' }: CardProps & { as?: 'li' | 'div' }) {
  const Tag = as
  return (
    <Tag className={clsx('flex h-full flex-col overflow-hidden rounded-2xl', CARD_STYLE[theme.cards.style], item.availability !== 'available' && 'opacity-60')}>
      {theme.cards.image === 'show' && <DishImage theme={theme} item={item} className={clsx('aspect-[4/3] w-full', theme.cards.imageShape === 'circle' && 'mx-auto mt-3 aspect-square w-3/4')} />}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="leading-snug font-semibold" style={heading}>
          {item.name}
        </h3>
        <Description theme={theme} text={item.description} />
        <Label item={item} />
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <Price item={item} />
          <QuantityControl item={item} quantity={quantity} onQuantity={onQuantity} size="sm" />
        </div>
      </div>
    </Tag>
  )
}

function LargeCard({ theme, item, quantity, onQuantity }: CardProps) {
  const withImage = theme.cards.image === 'show' && !!item.imagePath
  return (
    <li className={clsx('overflow-hidden rounded-3xl', CARD_STYLE[theme.cards.style], item.availability !== 'available' && 'opacity-60')}>
      {withImage ? (
        <div className="relative aspect-[16/10] w-full bg-cover bg-center" style={{ backgroundImage: `url("${productImageUrl(item.imagePath!)}")` }}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 text-white">
            <h3 className="text-2xl leading-tight" style={heading}>
              {item.name}
            </h3>
            {theme.cards.description !== 'hide' && item.description && (
              <p className={clsx('mt-1 text-sm text-white/80', theme.cards.description === 'clamp' && 'line-clamp-2')}>{item.description}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="px-4 pt-4">
          <h3 className="text-2xl leading-tight" style={heading}>
            {item.name}
          </h3>
          <Description theme={theme} text={item.description} className="mt-1" />
        </div>
      )}
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <Price item={item} className="text-lg" />
          <Label item={item} />
        </div>
        <QuantityControl item={item} quantity={quantity} onQuantity={onQuantity} />
      </div>
    </li>
  )
}

function MenuLine({ theme, n, item, quantity, onQuantity }: CardProps & { n: number }) {
  return (
    <li className={clsx(item.availability !== 'available' && 'opacity-60')}>
      <div className="flex items-baseline gap-2">
        <span className="text-sm text-(--pm-primary) tabular-nums" style={heading}>
          {n}.
        </span>
        <h3 className="text-lg" style={heading}>
          {item.name}
        </h3>
        <span className="mx-1 flex-1 translate-y-[-0.25em] border-b border-dotted border-(--pm-muted)" aria-hidden />
        <Price item={item} />
      </div>
      <div className="mt-1 flex items-start justify-between gap-3 pl-6">
        <div className="min-w-0">
          <Description theme={theme} text={item.description} className="italic" />
          <Label item={item} />
        </div>
        <QuantityControl item={item} quantity={quantity} onQuantity={onQuantity} size="sm" />
      </div>
    </li>
  )
}
