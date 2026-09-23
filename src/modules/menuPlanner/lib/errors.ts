import { getErrorMessage } from '@/shared/utils/errors'

/** 23505 = unique_violation en Postgres — acá siempre es el unique (plan_date, product_id) de dk_menu_plan_items. */
export function isDuplicatePlanItemError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === '23505'
}

/** Traduce el error crudo de la base ("duplicate key value violates…") a algo que un cocinero entienda. */
export function planItemErrorMessage(err: unknown, fallback: string, duplicateMessage: string): string {
  return isDuplicatePlanItemError(err) ? duplicateMessage : getErrorMessage(err, fallback)
}
