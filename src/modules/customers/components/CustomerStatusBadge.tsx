import { Badge } from '@/shared/ui/Badge'
import { formatMoney } from '@/shared/utils/format'
import type { CustomerBalance } from '../lib/balance'

/** Un solo badge que resume la cuenta del cliente en lenguaje simple — nunca "saldo: -$X" tipo contable. */
export function CustomerStatusBadge({ balance }: { balance: CustomerBalance }) {
  if (balance.balance <= 0) return <Badge tone="success" dot>Al día</Badge>
  if (balance.overdue) return <Badge tone="danger" dot>Vencido · {formatMoney(balance.overdueAmount)}</Badge>
  return <Badge tone="warning" dot>Debe {formatMoney(balance.balance)}</Badge>
}
