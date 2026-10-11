import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UtensilsCrossed } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getPublicMenu } from '../api/publicMenu'
import { DEFAULT_THEME, resolveTheme } from '../lib/themes'
import { PublicMenuView } from './MenuView'
import { ThemeRoot } from './ThemeRoot'

/**
 * The public menu of a business (ADR 0052): today's dishes from its planner,
 * a cart and a real order that goes to the kitchen. For the phone, outside
 * the app (no session), drawn with the business's published design (ADR 0053).
 */
export function PublicMenuPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const menu = useQuery({ queryKey: ['public-menu', slug], queryFn: () => getPublicMenu(slug), refetchInterval: 60_000, retry: 1 })

  useEffect(() => {
    const name = menu.data?.business.name
    document.title = name ? `${name} · Menú de hoy` : 'Menú · Quanela'
  }, [menu.data?.business.name])

  if (menu.data) {
    const theme = resolveTheme(menu.data.theme)
    return (
      <ThemeRoot theme={theme}>
        <PublicMenuView
          key={menu.data.today}
          slug={slug}
          menu={menu.data}
          theme={theme}
          onRefreshMenu={() => void queryClient.invalidateQueries({ queryKey: ['public-menu', slug] })}
          onPlaced={(token) => navigate(`/menu/${slug}/pedido/${token}`)}
        />
      </ThemeRoot>
    )
  }

  return (
    <ThemeRoot theme={DEFAULT_THEME}>
      {menu.isLoading ? (
        <MenuSkeleton />
      ) : menu.isError ? (
        <Message
          title="No pudimos abrir el menú"
          text="Revisa tu conexión e intenta de nuevo."
          action={
            <button onClick={() => void menu.refetch()} className={pillClass}>
              Reintentar
            </button>
          }
        />
      ) : (
        <Message title="Este menú no está disponible" text="El negocio no lo ha publicado o el enlace cambió. Pídele el enlace nuevo." />
      )}
    </ThemeRoot>
  )
}

const pillClass = 'inline-flex items-center justify-center gap-1.5 rounded-full bg-(--pm-primary) px-5 py-2.5 text-sm font-medium text-(--pm-on-primary) hover:opacity-90'

function Message({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <UtensilsCrossed size={32} className="text-(--pm-muted)" aria-hidden />
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-(--pm-muted)">{text}</p>
      {action}
      <a href="https://quanela.com" className="mt-6 text-xs text-(--pm-muted)">
        Hecho con Quanela
      </a>
    </div>
  )
}

function MenuSkeleton() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse space-y-4 px-4 py-6" aria-label="Cargando el menú">
      <div className="h-16 rounded-2xl bg-(--pm-soft)" />
      <div className="h-8 w-2/3 rounded-full bg-(--pm-soft)" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-28 rounded-2xl bg-(--pm-soft)" />
      ))}
    </div>
  )
}
