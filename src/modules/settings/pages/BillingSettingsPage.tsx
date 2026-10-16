import { PlanPanel } from '@/modules/organization/components/PlanPanel'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { EmptyState } from '@/shared/ui/EmptyState'
import { formatDate, formatMoney } from '@/shared/utils/format'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { fetchInvoices, type Invoice } from '../api'
import { SettingsPage } from '../ui/SettingsPage'
import { Section } from '@/shared/ui/Section'
import { StatusBadge } from '../ui/StatusBadge'

const KIND_LABEL: Record<NonNullable<Invoice['kind']>, string> = {
  activation: 'Activación',
  renewal: 'Renovación',
  upgrade: 'Cambio de plan',
  transfer: 'Transferencia',
}

const METHOD_LABEL: Record<string, string> = {
  CARD: 'Tarjeta',
  PSE: 'PSE',
  NEQUI: 'Nequi',
  BANCOLOMBIA_TRANSFER: 'Bancolombia',
  BANCOLOMBIA_QR: 'QR Bancolombia',
  TRANSFER: 'Transferencia',
}

/**
 * Facturación (ADR 0012, sección 7; ADR 0024; ADR 0066): one plan covers all
 * your accounts. The subscription is paid with Wompi; every payment is an
 * invoice here (only real data: nothing is made up).
 */
export function BillingSettingsPage() {
  const { organization } = useActiveKitchen()
  if (!organization) return null
  return <Billing organizationId={organization.id} />
}

function Billing({ organizationId }: { organizationId: string }) {
  const invoices = useQuery({ queryKey: ['org', organizationId, 'invoices'], queryFn: () => fetchInvoices(organizationId) })
  const columns: DataTableColumn<Invoice>[] = [
    { key: 'number', header: 'Factura', cell: (i) => <span className="font-medium text-neutral-100">{i.number}</span> },
    { key: 'kind', header: 'Concepto', hideBelow: 'md', cell: (i) => <span className="text-neutral-300">{i.kind ? KIND_LABEL[i.kind] : '—'}</span> },
    { key: 'method', header: 'Medio', hideBelow: 'lg', cell: (i) => <span className="text-neutral-400">{i.method ? (METHOD_LABEL[i.method] ?? i.method) : '—'}</span> },
    { key: 'date', header: 'Fecha', hideBelow: 'sm', cell: (i) => <span className="text-neutral-400">{formatDate(i.issuedAt)}</span> },
    {
      key: 'amount',
      header: 'Valor',
      align: 'right',
      cell: (i) => (
        <span className="tabular-nums text-neutral-200">
          {formatMoney(i.amount)} {i.currency}
        </span>
      ),
    },
    { key: 'status', header: 'Estado', cell: (i) => <StatusBadge status={i.status} /> },
    {
      key: 'pdf',
      header: <span className="sr-only">Documento</span>,
      align: 'right',
      cell: (i) =>
        i.pdfUrl ? (
          <a href={i.pdfUrl} className="text-sm text-brasa-400 hover:underline" target="_blank" rel="noreferrer">
            PDF
          </a>
        ) : null,
    },
  ]

  return (
    <SettingsPage title="Facturación" description="Tu plan, su uso y tus facturas.">
      <Section title="Plan" description="Aplica a todas tus cuentas: qué plan tienes, cuánto usas y qué incluye.">
        <PlanPanel organizationId={organizationId} />
      </Section>

      <Section title="Facturas">
        <DataTable
          columns={columns}
          rows={invoices.data}
          getRowId={(i) => i.id}
          isLoading={invoices.isLoading}
          error={invoices.isError ? invoices.error : undefined}
          onRetry={() => void invoices.refetch()}
          emptyState={<EmptyState icon={FileText} title="Aún no hay facturas" description="Aquí verás cada pago de tu suscripción." compact />}
        />
      </Section>
    </SettingsPage>
  )
}
