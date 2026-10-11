import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Page } from '@/shared/ui/Page'
import { PageHeader } from '@/shared/ui/PageHeader'
import { SubNav, type SubNavItem } from '@/shared/ui/SubNav'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { Globe } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { DesignTab } from '../components/DesignTab'
import { SummaryTab } from '../components/SummaryTab'
import { usePublicMenuSettings, useSavePublicMenuSettings } from '../hooks'
import type { PublicMenuSettings } from '../types'

type Tab = 'summary' | 'design'

const TABS: SubNavItem<Tab>[] = [
  { value: 'summary', label: 'Resumen' },
  { value: 'design', label: 'Diseño' },
]

/**
 * Menú público (ADR 0052): the account's menu of today on a public page, with
 * real orders that go to the kitchen. Fed by the planner — nothing to load
 * twice. Resumen: publish, the ordering options, the link, WhatsApp and the
 * QR. Diseño (ADR 0053): templates, appearance editor and live preview.
 */
export function PublicMenuAdminPage() {
  const settings = usePublicMenuSettings()
  if (settings.isError)
    return (
      <Page>
        <PageHeader title="Menú público" icon={Globe} />
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      </Page>
    )
  if (settings.isLoading || !settings.data)
    return (
      <Page>
        <PageHeader title="Menú público" icon={Globe} />
        <LoadingState variant="block" label="Cargando…" />
      </Page>
    )
  return <AdminView settings={settings.data} />
}

function AdminView({ settings }: { settings: PublicMenuSettings }) {
  const { kitchen, path } = useActiveKitchen()
  const { tab: tabParam } = useParams<{ tab?: string }>()
  const navigate = useNavigate()
  const save = useSavePublicMenuSettings()
  const { show } = useToast()
  const tab: Tab = tabParam === 'design' ? 'design' : 'summary'
  const goTo = (next: Tab) => navigate(path(next === 'summary' ? '/public-menu' : '/public-menu/design'))

  async function setPublished(published: boolean) {
    try {
      await save.mutateAsync({ published })
      show(published ? 'Tu menú ya está en línea. Comparte el enlace.' : 'Menú despublicado: el enlace ya no muestra el menú.')
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar'), 'error')
    }
  }

  return (
    <Page>
      <PageHeader
        help="public-menu"
        title="Menú público"
        icon={Globe}
        description={`El menú de hoy de ${kitchen.name} en una página para tus clientes, con pedidos que entran directo a cocina.`}
        meta={settings.published ? <Badge tone="success" dot>Publicado</Badge> : <Badge tone="neutral">No publicado</Badge>}
        actions={
          <Button variant={settings.published ? 'secondary' : 'primary'} onClick={() => void setPublished(!settings.published)} loading={save.isPending}>
            {settings.published ? 'Despublicar' : 'Publicar'}
          </Button>
        }
      />
      <SubNav label="Secciones del menú público" items={TABS} value={tab} onChange={goTo} />
      {tab === 'summary' ? <SummaryTab key={settings.slug} settings={settings} onEditDesign={() => goTo('design')} /> : <DesignTab key={settings.slug} settings={settings} />}
    </Page>
  )
}
