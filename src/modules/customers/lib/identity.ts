import type { CustomerIdentity } from '../types'

/** ADR 0044: «Empresa · NIT 900.123.456-7» — what identifies a company under its name (null for a person). */
export function companyLine(customer: CustomerIdentity): string | null {
  if (customer.type !== 'company') return null
  return ['Empresa', customer.taxId ? `NIT ${customer.taxId}` : null].filter(Boolean).join(' · ')
}
