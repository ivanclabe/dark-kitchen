import type { Receivable } from '@/modules/cartera/types'
import { todayStr } from '@/shared/utils/format'

export interface CustomerBalance {
  balance: number
  overdue: boolean
  overdueAmount: number
  orderCount: number
}

/** Agrega los renglones de dk_receivables de UN cliente — ya viene filtrado por quien llama, no consulta nada acá. */
export function computeCustomerBalance(receivables: Receivable[]): CustomerBalance {
  const today = todayStr()
  const overdueRows = receivables.filter((r) => r.dueDate && r.dueDate < today)
  return {
    balance: receivables.reduce((sum, r) => sum + r.balance, 0),
    overdue: overdueRows.length > 0,
    overdueAmount: overdueRows.reduce((sum, r) => sum + r.balance, 0),
    orderCount: receivables.length,
  }
}
