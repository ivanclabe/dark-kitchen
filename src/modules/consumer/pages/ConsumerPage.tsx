import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Page } from '@/shared/ui/Page'
import { PageHeader } from '@/shared/ui/PageHeader'
import { SubNav, type SubNavItem } from '@/shared/ui/SubNav'
import { IdCard, LayoutDashboard, Store, Utensils } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStorefront } from '../hooks/useStorefront'
import { consumerPath, type ConsumerSection } from '../lib/readiness'
import { ConsumerDishes } from '../components/ConsumerDishes'
import { ConsumerOverview } from '../components/ConsumerOverview'
import { ConsumerProfile } from '../components/ConsumerProfile'

const SECTIONS: SubNavItem<ConsumerSection>[] = [
  { value: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { value: 'perfil', label: 'Perfil del negocio', icon: IdCard },
  { value: 'platos', label: 'Platos', icon: Utensils },
]
const isSection = (v: string | undefined): v is ConsumerSection => v === 'resumen' || v === 'perfil' || v === 'platos'

/**
 * Quanela Consumer (ADR 0042), a module of its own (ADR 0046): what this
 * account shows to end customers in the Quanela Consumer app. Three sections —
 * Resumen (state, what is missing, how customers see you), Perfil del negocio
 * and Platos. Off by default; nothing private (costs, recipes, customers,
 * amounts) can be published. Prices, availability and hours are read live.
 */
export function ConsumerPage() {
  const { section: param } = useParams<{ section?: string }>()
  const section: ConsumerSection = isSection(param) ? param : 'resumen'
  const navigate = useNavigate()
  const { path } = useActiveKitchen()
  const query = useStorefront()
  const go = (next: ConsumerSection) => navigate(path(consumerPath(next)))

  return (
    <Page>
      <PageHeader
        help="quanela-consumer"
        title="Quanela Consumer"
        icon={Store}
        description="Lo que ven los clientes en Quanela Consumer, la app donde dicen qué quieren comer y Quanela les recomienda dónde pedir."
      />
      <SubNav label="Secciones de Quanela Consumer" items={SECTIONS} value={section} onChange={go} />
      {query.isLoading ? (
        <LoadingState variant="block" />
      ) : query.isError || !query.data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : section === 'perfil' ? (
        // Remounted with fresh data after each save: the form starts from what the database has.
        <ConsumerProfile key={`p${query.dataUpdatedAt}`} state={query.data} />
      ) : section === 'platos' ? (
        <ConsumerDishes key={`d${query.dataUpdatedAt}`} state={query.data} />
      ) : (
        <ConsumerOverview state={query.data} onGoTo={go} />
      )}
    </Page>
  )
}
