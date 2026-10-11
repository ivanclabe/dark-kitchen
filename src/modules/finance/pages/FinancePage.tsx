import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Page } from '@/shared/ui/Page'
import { PageHeader } from '@/shared/ui/PageHeader'
import { SubNav, type SubNavItem } from '@/shared/ui/SubNav'
import { Landmark } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { ExpensesTab } from '../components/ExpensesTab'
import { PayablesTab } from '../components/PayablesTab'
import { CashflowTab, PaymentsTab } from '../components/PaymentsTab'
import { PayrollTab } from '../components/PayrollTab'
import { ProfitTab } from '../components/ProfitTab'

type FinanceTab = 'profit' | 'payables' | 'payments' | 'expenses' | 'payroll' | 'cashflow'

const TABS: SubNavItem<FinanceTab>[] = [
  { value: 'profit', label: 'Rentabilidad' },
  { value: 'payables', label: 'Por pagar' },
  { value: 'payments', label: 'Pagos' },
  { value: 'expenses', label: 'Gastos' },
  { value: 'payroll', label: 'Nómina' },
  { value: 'cashflow', label: 'Flujo de caja' },
]

/** Help article of each tab (ADR 0034). */
const HELP: Record<FinanceTab, string> = {
  profit: 'profitability',
  payables: 'payables',
  payments: 'payables',
  expenses: 'expenses',
  payroll: 'payroll',
  cashflow: 'profitability',
}

/**
 * Finanzas (ADR 0051): what the business owes and pays, kept apart, and the
 * real profitability. Tables and clear numbers first; the visual dashboard
 * comes once the data has been validated with real use.
 */
export function FinancePage() {
  const { tab: tabParam } = useParams<{ tab?: string }>()
  const navigate = useNavigate()
  const { path, can } = useActiveKitchen()
  const tabs = TABS.filter((t) => t.value !== 'payroll' || can('finance.payroll'))
  const fallback: FinanceTab = can('reports.profitability') ? 'profit' : 'payables'
  const tab = tabs.find((t) => t.value === tabParam)?.value ?? fallback

  return (
    <Page>
      <PageHeader
        help={HELP[tab]}
        title="Finanzas"
        icon={Landmark}
        description="Lo que se debe, lo que se paga, el flujo de caja y la rentabilidad real."
      />
      <SubNav label="Secciones de finanzas" items={tabs} value={tab} onChange={(next) => navigate(path(`/finance/${next}`))} />
      {tab === 'profit' && <ProfitTab />}
      {tab === 'payables' && <PayablesTab />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'expenses' && <ExpensesTab />}
      {tab === 'payroll' && <PayrollTab allowed={can('finance.payroll')} />}
      {tab === 'cashflow' && <CashflowTab />}
    </Page>
  )
}
