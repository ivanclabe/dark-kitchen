import { PlanPanel } from '@/modules/organization/components/PlanPanel'
import { useOrgAdmin } from '@/shared/org/orgContext'
import { Badge } from '@/shared/ui/Badge'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { PageHeader } from '@/shared/ui/PageHeader'
import { typography } from '@/shared/ui/typography'
import { formatDate, formatMoney } from '@/shared/utils/format'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, FileText, Wallet } from 'lucide-react'
import { fetchInvoices, type Invoice } from '../api'

const INVOICE_STATUS: Record<Invoice['status'], { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' }> = {
  paid: { label: 'Pagada', tone: 'success' },
  open: { label: 'Pendiente', tone: 'warning' },
  draft: { label: 'Borrador', tone: 'neutral' },
  void: { label: 'Anulada', tone: 'neutral' },
  uncollectible: { label: 'Incobrable', tone: 'danger' },
}

/**
 * Facturación (ADR 0012, sección 7): el plan es de la organización. Muestra
 * solo datos reales; facturas y métodos de pago quedan listos para cuando se
 * conecte un proveedor de pagos (hoy no se inventa nada).
 */
export function OrgBillingPage() {
  const { organization } = useOrgAdmin()
  const invoices = useQuery({ queryKey: ['org', organization.id, 'invoices'], queryFn: () => fetchInvoices(organization.id) })

  return (
    <div className="space-y-6">
      <PageHeader title="Facturación" icon={CreditCard} description={`Plan, límites y uso de ${organization.name}.`} />
      <PlanPanel organizationId={organization.id} />

      <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
        <Card title="Facturas" icon={FileText}>
          {invoices.isLoading ? (
            <LoadingState variant="block" />
          ) : invoices.isError ? (
            <ErrorState error={invoices.error} onRetry={() => void invoices.refetch()} />
          ) : !invoices.data?.length ? (
            <EmptyState icon={FileText} title="Aún no hay facturas" description="Los pagos en línea todavía no están activos. Cuando lo estén, aquí verás cada factura." compact />
          ) : (
            <ul className="divide-y divide-neutral-800/60">
              {invoices.data.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-neutral-100">{i.number}</span>
                    <span className="ml-2 text-neutral-500">{formatDate(i.issuedAt)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums text-neutral-200">
                      {formatMoney(i.amount)} {i.currency}
                    </span>
                    <Badge size="sm" tone={INVOICE_STATUS[i.status].tone}>
                      {INVOICE_STATUS[i.status].label}
                    </Badge>
                    {i.pdfUrl && (
                      <a href={i.pdfUrl} className="text-brasa-400 hover:underline" target="_blank" rel="noreferrer">
                        PDF
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Método de pago" icon={Wallet}>
          <p className="text-sm text-neutral-300">Sin método de pago.</p>
          <p className={`mt-1 ${typography.caption}`}>
            Los pagos en línea todavía no están activos: no se guarda ningún dato de tarjetas. Para cambiar de plan o de periodicidad, usa «Cambiar de plan».
          </p>
        </Card>
      </div>
    </div>
  )
}
