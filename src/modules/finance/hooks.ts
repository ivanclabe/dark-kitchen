import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addPreviousPurchases,
  createCategory,
  createExpense,
  getCashflow,
  getPayablesSummary,
  getPnl,
  getPurchaseObligation,
  getSupplierOwed,
  liquidatePayroll,
  listCategories,
  listObligations,
  listObligationsByIds,
  listPayments,
  listPreviousPurchases,
  listRecurring,
  listTeamPay,
  payObligation,
  payObligationsBatch,
  confirmObligationAmount,
  saveRecurring,
  setMemberPay,
  setVatDeductible,
  voidObligation,
  voidPayment,
} from './api'
import type { ObligationKind } from './types'

const FINANCE = ['finance'] as const

export const usePnl = (from: string, to: string, enabled = true) =>
  useQuery({ queryKey: [...FINANCE, 'pnl', from, to], queryFn: () => getPnl(from, to), enabled })
export const useCashflow = (from: string, to: string) => useQuery({ queryKey: [...FINANCE, 'cashflow', from, to], queryFn: () => getCashflow(from, to) })
export const usePayablesSummary = () => useQuery({ queryKey: [...FINANCE, 'payables'], queryFn: getPayablesSummary })
export const useObligations = (filter: { kind?: ObligationKind; open?: boolean } = {}) =>
  useQuery({ queryKey: [...FINANCE, 'obligations', filter], queryFn: () => listObligations(filter) })
export const usePayments = (from: string, to: string) => useQuery({ queryKey: [...FINANCE, 'payments', from, to], queryFn: () => listPayments(from, to) })
export const useObligationsByIds = (ids: string[]) =>
  useQuery({ queryKey: [...FINANCE, 'obligations-by-id', [...ids].sort().join(',')], queryFn: () => listObligationsByIds(ids), enabled: ids.length > 0 })
export const useCategories = () => useQuery({ queryKey: [...FINANCE, 'categories'], queryFn: listCategories })
export const useRecurring = () => useQuery({ queryKey: [...FINANCE, 'recurring'], queryFn: listRecurring })
export const useTeamPay = (enabled = true) => useQuery({ queryKey: [...FINANCE, 'team-pay'], queryFn: listTeamPay, enabled })
export const usePreviousPurchases = (enabled: boolean) => useQuery({ queryKey: [...FINANCE, 'previous-purchases'], queryFn: listPreviousPurchases, enabled })
export const usePurchaseObligation = (purchaseId: string, enabled: boolean) =>
  useQuery({ queryKey: [...FINANCE, 'purchase', purchaseId], queryFn: () => getPurchaseObligation(purchaseId), enabled })
export const useSupplierOwed = (supplierId: string, enabled: boolean) =>
  useQuery({ queryKey: [...FINANCE, 'supplier', supplierId], queryFn: () => getSupplierOwed(supplierId), enabled })

/** Every write refreshes all of Finanzas (and purchases, whose payment status shows there). */
function useFinanceMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: FINANCE })
      void queryClient.invalidateQueries({ queryKey: ['purchases'] })
    },
  })
}

export const usePayObligation = () => useFinanceMutation(payObligation)
// ADR 0063: pay several of one payee at once, and confirm a variable amount.
export const usePayObligationsBatch = () => useFinanceMutation(payObligationsBatch)
export const useConfirmObligationAmount = () => useFinanceMutation(({ id, amount }: { id: string; amount: number }) => confirmObligationAmount(id, amount))
export const useVoidPayment = () => useFinanceMutation(({ id, reason }: { id: string; reason: string }) => voidPayment(id, reason))
export const useVoidObligation = () => useFinanceMutation(({ id, reason }: { id: string; reason: string }) => voidObligation(id, reason))
export const useCreateExpense = () => useFinanceMutation(createExpense)
export const useCreateCategory = () => useFinanceMutation(createCategory)
export const useSaveRecurring = () => useFinanceMutation(saveRecurring)
export const useSetMemberPay = () => useFinanceMutation(setMemberPay)
export const useLiquidatePayroll = () =>
  useFinanceMutation(({ from, to, dueDate, lines }: { from: string; to: string; dueDate: string; lines: { userId: string; amount: number; note?: string | null }[] }) =>
    liquidatePayroll(from, to, dueDate, lines),
  )
export const useAddPreviousPurchases = () => useFinanceMutation(addPreviousPurchases)
export const useSetVatDeductible = () => useFinanceMutation(setVatDeductible)
