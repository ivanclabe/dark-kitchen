import { useQuery } from '@tanstack/react-query'
import {
  getProfitability,
  getPurchasesBySupplier,
  getSalesByDay,
  getTopIngredientsPurchased,
  getTopProducts,
  getWasteReport,
} from '../api/reports'

export function useSalesByDay(from: string, to: string) {
  return useQuery({ queryKey: ['report-sales', from, to], queryFn: () => getSalesByDay(from, to) })
}

export function useTopProducts(from: string, to: string) {
  return useQuery({ queryKey: ['report-top-products', from, to], queryFn: () => getTopProducts(from, to) })
}

export function usePurchasesBySupplier(from: string, to: string) {
  return useQuery({ queryKey: ['report-purchases-supplier', from, to], queryFn: () => getPurchasesBySupplier(from, to) })
}

export function useTopIngredientsPurchased(from: string, to: string) {
  return useQuery({
    queryKey: ['report-top-ingredients', from, to],
    queryFn: () => getTopIngredientsPurchased(from, to),
  })
}

export function useWasteReport(from: string, to: string) {
  return useQuery({ queryKey: ['report-waste', from, to], queryFn: () => getWasteReport(from, to) })
}

export function useProfitability(from: string, to: string) {
  return useQuery({ queryKey: ['report-profitability', from, to], queryFn: () => getProfitability(from, to) })
}
