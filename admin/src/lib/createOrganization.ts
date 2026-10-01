import type { NewOrganizationInput } from './api'

/** Client checks of the create-organization form; the database checks again. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const EMPTY_ORGANIZATION: NewOrganizationInput = { name: '', sector: '', category: '', adminName: '', adminEmail: '', plan: '', country: 'CO', city: '', phone: '', taxId: '' }

/** Errors of one step, by field; empty when the step can continue. */
export function validateStep(step: 'business' | 'admin', form: NewOrganizationInput): Partial<Record<keyof NewOrganizationInput, string>> {
  const errors: Partial<Record<keyof NewOrganizationInput, string>> = {}
  if (step === 'business') {
    const name = form.name.trim()
    if (name.length < 2 || name.length > 80) errors.name = 'Entre 2 y 80 caracteres'
    if (!form.sector) errors.sector = 'Elige el sector'
    if (!form.category) errors.category = 'Elige la categoría'
    if (!form.plan) errors.plan = 'Elige el plan'
    if (!form.country) errors.country = 'Elige el país'
  } else {
    const adminName = form.adminName.trim()
    if (adminName.length < 2 || adminName.length > 80) errors.adminName = 'Entre 2 y 80 caracteres'
    if (!EMAIL_RE.test(form.adminEmail.trim())) errors.adminEmail = 'Escribe un correo válido'
  }
  return errors
}
