import {
  AlarmClock,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  Gauge,
  HandCoins,
  Package,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

/** The icon of each notice type: the same in the bell and in Inicio's «Necesita atención». */
export const NOTICE_ICON: Record<string, LucideIcon> = {
  late_orders: AlarmClock,
  to_confirm: ClipboardList,
  low_stock: Package,
  overdue_customers: Wallet,
  ai_error: XCircle,
  ai_quota: Gauge,
  trial: CreditCard,
  plan_limit: CreditCard,
  // ADR 0063: administration.
  payables_overdue: HandCoins,
  payables_due: HandCoins,
  amount_pending: HandCoins,
  old_drafts: ShoppingCart,
  invoices_unsaved: FileText,
  price_up: TrendingUp,
  below_cost: TrendingDown,
  above_target: TrendingDown,
  open_shifts: Clock,
  ai_budget: Gauge,
}
