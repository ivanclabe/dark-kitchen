/** ADR 0051 — obligations, payments and real profitability. */
export type ObligationKind = 'purchase' | 'expense' | 'payroll'
export type ObligationStatus = 'pending' | 'partial' | 'overdue' | 'paid' | 'voided'
export type PaymentMethod = 'Efectivo' | 'Transferencia' | 'Tarjeta' | 'Otro'
export const PAYMENT_METHODS: PaymentMethod[] = ['Efectivo', 'Transferencia', 'Tarjeta', 'Otro']

export interface Obligation {
  id: string
  kind: ObligationKind
  categoryId: string | null
  categoryName: string | null
  purchaseId: string | null
  invoiceNumber: string | null
  supplierId: string | null
  memberUserId: string | null
  payee: string | null
  description: string
  amount: number
  paid: number
  balance: number
  status: ObligationStatus
  accrualDate: string
  periodStart: string | null
  periodEnd: string | null
  dueDate: string
  recurringId: string | null
  notes: string | null
  voidReason: string | null
  createdAt: string
  /** ADR 0063: a «monto variable» month whose real amount is not confirmed yet (it cannot be paid). */
  amountPending: boolean
}

export interface ObligationPayment {
  id: string
  obligationId: string
  amount: number
  paidOn: string
  method: PaymentMethod
  reference: string | null
  note: string | null
  voidsPaymentId: string | null
  createdAt: string
}

export interface ExpenseCategory {
  id: string
  name: string
  active: boolean
}

export interface RecurringObligation {
  id: string
  categoryId: string
  supplierId: string | null
  payeeName: string | null
  description: string
  amount: number
  dayOfMonth: number
  startsOn: string
  active: boolean
  /** ADR 0063: the amount changes each month (power, gas): each month asks for the real one. */
  variableAmount: boolean
}

export interface Pnl {
  from: string
  to: string
  orders: number
  grossSales: number
  discounts: number
  netSales: number
  deliveryIncome: number
  cogs: number
  estimatedCogs: number
  grossProfit: number
  grossMargin: number | null
  waste: number
  adjustments: number
  purchaseVat: number
  purchaseVatDeductible: boolean
  payroll: number
  expenses: number
  expensesByCategory: { categoryId: string; category: string; amount: number }[]
  operatingProfit: number
  operatingMargin: number | null
  coverage: {
    costCoverage: number | null
    uncostedSales: number
    unvaluedAdjustments: number
    membersWithoutPay: number
    noExpenses: boolean
    noPayroll: boolean
  }
}

export interface Cashflow {
  in: number
  out: number
  net: number
  outByKind: Record<ObligationKind, number>
  inByMethod: Record<string, number>
  outByMethod: Record<string, number>
  days: { day: string; in: number; out: number }[]
  payrollVisible: boolean
}

export interface PayablesSummary {
  total: number
  overdue: number
  next7Days: number
  count: number
  byKind: Record<ObligationKind, number>
  previousPurchases: number
}

export interface TeamMemberPay {
  userId: string
  fullName: string
  avatarKey: string | null
  active: boolean
  roleName: string | null
  payType: 'hourly' | 'monthly' | null
  rate: number | null
  effectiveFrom: string | null
}

export interface PayrollProposalLine {
  userId: string
  name: string
  payType: 'hourly' | 'monthly' | null
  rate: number | null
  hours: number
  amount: number | null
  liquidated: boolean
  /** ADR 0063: shifts of the period clocked in and never out (they count 0 hours). */
  openShifts: number
}

export interface ExpenseInput {
  categoryId: string
  supplierId?: string | null
  payeeName?: string | null
  description: string
  amount: number
  accrualDate: string
  periodStart?: string | null
  periodEnd?: string | null
  dueDate: string
  notes?: string | null
  payNow?: { method: PaymentMethod; paidOn?: string; reference?: string | null } | null
}

export interface RecurringInput {
  id?: string | null
  categoryId: string
  supplierId?: string | null
  payeeName?: string | null
  description: string
  amount: number
  dayOfMonth: number
  startsOn?: string
  active: boolean
  variableAmount?: boolean
}

export interface PreviousPurchase {
  id: string
  supplierName: string
  invoiceNumber: string
  invoiceDate: string
  total: number
}

/** How a purchase was paid when confirming it (ADR 0051, D3). */
export type PurchasePayment = { mode: 'cash'; method: PaymentMethod; paidOn?: string; reference?: string | null } | { mode: 'credit'; dueDate?: string }
