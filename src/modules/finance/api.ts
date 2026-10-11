/**
 * ADR 0051 — Finanzas. Everything that writes goes through database functions
 * (obligations and payments have no direct write access); reads use RLS.
 */
import { supabase } from '@/shared/lib/supabase'
import type {
  Cashflow,
  ExpenseCategory,
  ExpenseInput,
  Obligation,
  ObligationKind,
  ObligationPayment,
  ObligationStatus,
  PayablesSummary,
  PaymentMethod,
  PayrollProposalLine,
  Pnl,
  PreviousPurchase,
  RecurringInput,
  RecurringObligation,
  TeamMemberPay,
} from './types'

interface BalanceRow {
  id: string
  kind: ObligationKind
  category_id: string | null
  category_name: string | null
  purchase_id: string | null
  invoice_number: string | null
  supplier_id: string | null
  member_user_id: string | null
  payee: string | null
  description: string
  amount: number
  paid: number
  balance: number
  status: ObligationStatus
  accrual_date: string
  period_start: string | null
  period_end: string | null
  due_date: string
  recurring_id: string | null
  notes: string | null
  void_reason: string | null
  created_at: string
}

function mapObligation(r: BalanceRow): Obligation {
  return {
    id: r.id,
    kind: r.kind,
    categoryId: r.category_id,
    categoryName: r.category_name,
    purchaseId: r.purchase_id,
    invoiceNumber: r.invoice_number,
    supplierId: r.supplier_id,
    memberUserId: r.member_user_id,
    payee: r.payee,
    description: r.description,
    amount: Number(r.amount),
    paid: Number(r.paid),
    balance: Number(r.balance),
    status: r.status,
    accrualDate: r.accrual_date,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    dueDate: r.due_date,
    recurringId: r.recurring_id,
    notes: r.notes,
    voidReason: r.void_reason,
    createdAt: r.created_at,
  }
}

const BALANCE_SELECT =
  'id, kind, category_id, category_name, purchase_id, invoice_number, supplier_id, member_user_id, payee, description, amount, paid, balance, status, accrual_date, period_start, period_end, due_date, recurring_id, notes, void_reason, created_at'

/** Obligations, the next ones to fall due first; `open` = only those with something to pay. */
export async function listObligations({ kind, open, limit = 200 }: { kind?: ObligationKind; open?: boolean; limit?: number } = {}): Promise<Obligation[]> {
  let q = supabase.from('dk_obligation_balances').select(BALANCE_SELECT)
  if (kind) q = q.eq('kind', kind)
  if (open) q = q.gt('balance', 0)
  const { data, error } = await q.order('due_date', { ascending: true }).order('created_at').limit(limit)
  if (error) throw error
  return (data as unknown as BalanceRow[]).map(mapObligation)
}

/** The obligation of a purchase (its payment status in Compras). */
export async function getPurchaseObligation(purchaseId: string): Promise<Obligation | null> {
  const { data, error } = await supabase.from('dk_obligation_balances').select(BALANCE_SELECT).eq('purchase_id', purchaseId).maybeSingle()
  if (error) throw error
  return data ? mapObligation(data as unknown as BalanceRow) : null
}

/** What is owed to a supplier now. */
export async function getSupplierOwed(supplierId: string): Promise<number> {
  const { data, error } = await supabase.from('dk_obligation_balances').select('balance').eq('supplier_id', supplierId).gt('balance', 0)
  if (error) throw error
  return (data ?? []).reduce((sum, r) => sum + Number(r.balance), 0)
}

export async function listPayments(from: string, to: string): Promise<ObligationPayment[]> {
  const { data, error } = await supabase
    .from('dk_obligation_payments')
    .select('id, obligation_id, amount, paid_on, method, reference, note, voids_payment_id, created_at')
    .gte('paid_on', from)
    .lte('paid_on', to)
    .order('paid_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    obligationId: r.obligation_id,
    amount: Number(r.amount),
    paidOn: r.paid_on,
    method: r.method as PaymentMethod,
    reference: r.reference,
    note: r.note,
    voidsPaymentId: r.voids_payment_id,
    createdAt: r.created_at,
  }))
}

export async function listObligationsByIds(ids: string[]): Promise<Obligation[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('dk_obligation_balances').select(BALANCE_SELECT).in('id', ids)
  if (error) throw error
  return (data as unknown as BalanceRow[]).map(mapObligation)
}

export async function getPnl(from: string, to: string): Promise<Pnl> {
  const { data, error } = await supabase.rpc('dk_finance_pnl', { p_from: from, p_to: to })
  if (error) throw error
  return data as unknown as Pnl
}

export async function getCashflow(from: string, to: string): Promise<Cashflow> {
  const { data, error } = await supabase.rpc('dk_finance_cashflow', { p_from: from, p_to: to })
  if (error) throw error
  return data as unknown as Cashflow
}

export async function getPayablesSummary(): Promise<PayablesSummary> {
  const { data, error } = await supabase.rpc('dk_finance_payables_summary')
  if (error) throw error
  return data as unknown as PayablesSummary
}

export async function payObligation(input: { obligationId: string; amount: number; paidOn: string; method: PaymentMethod; reference?: string | null; note?: string | null }): Promise<void> {
  const { error } = await supabase.rpc('dk_finance_pay', {
    p_obligation: input.obligationId,
    p_amount: input.amount,
    p_paid_on: input.paidOn,
    p_method: input.method,
    p_reference: input.reference ?? undefined,
    p_note: input.note ?? undefined,
  })
  if (error) throw error
}

export async function voidPayment(paymentId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('dk_finance_void_payment', { p_payment: paymentId, p_reason: reason })
  if (error) throw error
}

export async function voidObligation(obligationId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('dk_finance_void_obligation', { p_obligation: obligationId, p_reason: reason })
  if (error) throw error
}

export async function createExpense(input: ExpenseInput): Promise<string> {
  const { data, error } = await supabase.rpc('dk_finance_create_expense', { p: input as never })
  if (error) throw error
  return data as string
}

export async function listCategories(): Promise<ExpenseCategory[]> {
  const { data, error } = await supabase.from('dk_expense_categories').select('id, name, active').order('sort_order').order('name')
  if (error) throw error
  return data ?? []
}

export async function createCategory(name: string): Promise<ExpenseCategory> {
  const { data, error } = await supabase.from('dk_expense_categories').insert({ name: name.trim() }).select('id, name, active').single()
  if (error) throw error
  return data
}

export async function listRecurring(): Promise<RecurringObligation[]> {
  const { data, error } = await supabase
    .from('dk_recurring_obligations')
    .select('id, category_id, supplier_id, payee_name, description, amount, day_of_month, starts_on, active')
    .order('active', { ascending: false })
    .order('description')
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    categoryId: r.category_id,
    supplierId: r.supplier_id,
    payeeName: r.payee_name,
    description: r.description,
    amount: Number(r.amount),
    dayOfMonth: r.day_of_month,
    startsOn: r.starts_on,
    active: r.active,
  }))
}

export async function saveRecurring(input: RecurringInput): Promise<string> {
  const { data, error } = await supabase.rpc('dk_finance_save_recurring', { p: input as never })
  if (error) throw error
  return data as string
}

export async function listTeamPay(): Promise<TeamMemberPay[]> {
  const { data, error } = await supabase.rpc('dk_finance_team')
  if (error) throw error
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    fullName: r.full_name,
    avatarKey: r.avatar_key,
    active: r.active,
    roleName: r.role_name,
    payType: (r.pay_type as TeamMemberPay['payType']) ?? null,
    rate: r.rate === null ? null : Number(r.rate),
    effectiveFrom: r.effective_from,
  }))
}

/** How a person is paid from a date on (a new row: the history stays). */
export async function setMemberPay(input: { userId: string; payType: 'hourly' | 'monthly'; rate: number; effectiveFrom: string }): Promise<void> {
  // The same start date replaces that row (no update policy: history is rows).
  const { error: deleteError } = await supabase.from('dk_member_pay').delete().eq('user_id', input.userId).eq('effective_from', input.effectiveFrom)
  if (deleteError) throw deleteError
  const { error } = await supabase.from('dk_member_pay').insert({ user_id: input.userId, pay_type: input.payType, rate: input.rate, effective_from: input.effectiveFrom })
  if (error) throw error
}

export async function getPayrollProposal(from: string, to: string): Promise<PayrollProposalLine[]> {
  const { data, error } = await supabase.rpc('dk_finance_payroll_proposal', { p_from: from, p_to: to })
  if (error) throw error
  return ((data as unknown as PayrollProposalLine[]) ?? []).map((l) => ({
    ...l,
    rate: l.rate === null ? null : Number(l.rate),
    hours: Number(l.hours),
    amount: l.amount === null ? null : Number(l.amount),
  }))
}

export async function liquidatePayroll(from: string, to: string, dueDate: string, lines: { userId: string; amount: number; note?: string | null }[]): Promise<number> {
  const { data, error } = await supabase.rpc('dk_finance_liquidate_payroll', { p_from: from, p_to: to, p_due: dueDate, p_lines: lines as never })
  if (error) throw error
  return data as number
}

/** Confirmed purchases that have no obligation (from before Finanzas). */
export async function listPreviousPurchases(): Promise<PreviousPurchase[]> {
  const [{ data: purchases, error }, { data: owed, error: owedError }] = await Promise.all([
    supabase.from('dk_purchases').select('id, invoice_number, invoice_date, total, dk_suppliers ( name )').eq('status', 'CONFIRMADA').gt('total', 0).order('invoice_date', { ascending: false }).limit(200),
    supabase.from('dk_obligations').select('purchase_id').eq('kind', 'purchase'),
  ])
  if (error) throw error
  if (owedError) throw owedError
  const withObligation = new Set((owed ?? []).map((o) => o.purchase_id))
  return ((purchases ?? []) as unknown as { id: string; invoice_number: string; invoice_date: string; total: number; dk_suppliers: { name: string } | null }[])
    .filter((p) => !withObligation.has(p.id))
    .map((p) => ({ id: p.id, supplierName: p.dk_suppliers?.name ?? '—', invoiceNumber: p.invoice_number, invoiceDate: p.invoice_date, total: Number(p.total) }))
}

export async function addPreviousPurchases(ids: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('dk_finance_add_previous_purchases', { p_purchase_ids: ids })
  if (error) throw error
  return data as number
}

export async function setVatDeductible(deductible: boolean): Promise<void> {
  const { error } = await supabase.rpc('dk_finance_set_vat_deductible', { p_deductible: deductible })
  if (error) throw error
}
