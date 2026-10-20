import type { Can } from '@/shared/rbac/roles'

export type FinanceTab = 'profit' | 'payables' | 'payments' | 'expenses' | 'payroll' | 'cashflow'

const TABS: { value: FinanceTab; label: string }[] = [
  { value: 'profit', label: 'Rentabilidad' },
  { value: 'payables', label: 'Por pagar' },
  { value: 'payments', label: 'Pagos' },
  { value: 'expenses', label: 'Gastos' },
  { value: 'payroll', label: 'Nómina' },
  { value: 'cashflow', label: 'Flujo de caja' },
]

/** The sections of Finanzas this role can open (the page and the sidebar, ADR 0072). */
export function financeTabs(can: Can) {
  return TABS.filter((t) => t.value !== 'payroll' || can('finance.payroll'))
}
