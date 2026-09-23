import { supabase } from '@/shared/lib/supabase'
import type { CustomerPayment, Receivable, RecentPayment, RegisterPaymentInput } from '../types'

interface ReceivableRow {
  order_id: string
  order_number: number
  customer_id: string
  customer_name: string
  customer_phone: string | null
  status: string
  total: number
  paid_amount: number
  balance: number
  due_date: string | null
  created_at: string
}

function mapRow(row: ReceivableRow): Receivable {
  return {
    orderId: row.order_id,
    orderNumber: row.order_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    status: row.status,
    total: row.total,
    paidAmount: row.paid_amount,
    balance: row.balance,
    dueDate: row.due_date,
    createdAt: row.created_at,
  }
}

/** Pedidos con saldo pendiente — respaldado por la vista dk_receivables (total - pagos, sin CANCELADO). */
export async function listReceivables(): Promise<Receivable[]> {
  const { data, error } = await supabase
    .from('dk_receivables')
    .select('order_id, order_number, customer_id, customer_name, customer_phone, status, total, paid_amount, balance, due_date, created_at')
    .order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data as unknown as ReceivableRow[]).map(mapRow)
}

/** Registra un abono/pago contra un pedido vía dk_register_payment (valida rol, estado y que no exceda el saldo). */
export async function registerPayment(input: RegisterPaymentInput): Promise<void> {
  const { error } = await supabase.rpc('dk_register_payment', {
    p_order_id: input.orderId,
    p_amount: input.amount,
    p_method: input.method || undefined,
    p_note: input.note || undefined,
  })
  if (error) throw error
}

interface PaymentRow {
  id: string
  order_id: string
  amount: number
  method: string | null
  note: string | null
  created_at: string
  dk_orders: { order_number: number; customer_id: string; dk_customers: { full_name: string } | null } | null
}

/** Pagos de UN cliente — join dk_order_payments -> dk_orders (dk_order_payments no tiene customer_id directo). */
export async function listPaymentsByCustomer(customerId: string): Promise<CustomerPayment[]> {
  const { data, error } = await supabase
    .from('dk_order_payments')
    .select('id, order_id, amount, method, note, created_at, dk_orders!inner ( order_number, customer_id )')
    .eq('dk_orders.customer_id', customerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as unknown as PaymentRow[]).map((row) => ({
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.dk_orders?.order_number ?? 0,
    amount: Number(row.amount),
    method: row.method,
    note: row.note,
    createdAt: row.created_at,
  }))
}

/** Últimos pagos registrados en toda la app — alimenta el panel "Actividad reciente" del dashboard de Clientes. */
export async function listRecentPayments(limit = 8): Promise<RecentPayment[]> {
  const { data, error } = await supabase
    .from('dk_order_payments')
    .select('id, order_id, amount, method, note, created_at, dk_orders!inner ( order_number, customer_id, dk_customers ( full_name ) )')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as unknown as PaymentRow[]).map((row) => ({
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.dk_orders?.order_number ?? 0,
    amount: Number(row.amount),
    method: row.method,
    note: row.note,
    createdAt: row.created_at,
    customerId: row.dk_orders?.customer_id ?? '',
    customerName: row.dk_orders?.dk_customers?.full_name ?? '—',
  }))
}
