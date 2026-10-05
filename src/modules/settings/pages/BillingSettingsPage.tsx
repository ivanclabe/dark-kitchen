import { PlanPanel } from '@/modules/organization/components/PlanPanel'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { EmptyState } from '@/shared/ui/EmptyState'
import { typography } from '@/shared/ui/typography'
import { formatDate, formatMoney } from '@/shared/utils/format'
import { useQuery } from '@tanstack/react-query'
import { FileText, Wallet } from 'lucide-react'
import { fetchInvoices, type Invoice } from '../api'
import { SettingsPage } from '../ui/SettingsPage'
import { Section } from '@/shared/ui/Section'
import { StatusBadge } from '../ui/StatusBadge'

/**
 * Facturación (ADR 0012, sección 7; ADR 0024): one plan covers all your
 * accounts. Only real data; invoices and payment methods are ready for when a
 * payment provider is connected (nothing is made up today).
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
          emptyState={<EmptyState icon={FileText} title="Aún no hay facturas" description="Los pagos en línea todavía no están activos. Cuando lo estén, aquí verás cada factura." compact />}
        />
      </Section>

      <Section title="Método de pago" card>
        <div className="flex items-start gap-3">
          <Wallet size={18} className="mt-0.5 shrink-0 text-neutral-500" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm text-neutral-200">Sin método de pago.</p>
            <p className={`mt-1 ${typography.caption}`}>
              Los pagos en línea todavía no están activos: no se guarda ningún dato de tarjetas. Para cambiar de plan o de periodicidad, usa «Cambiar de plan».
            </p>
          </div>
        </div>
      </Section>
    </SettingsPage>
  )
}
