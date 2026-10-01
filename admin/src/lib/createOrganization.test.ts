import { describe, expect, it } from 'vitest'
import { EMPTY_ORGANIZATION, validateStep } from './createOrganization'

// ADR 0019: the create-organization form stops at each step until it is complete.
const business = { ...EMPTY_ORGANIZATION, name: 'Brasa Norte', sector: 'restaurant', category: 'grill', plan: 'starter', country: 'CO' }

describe('validateStep', () => {
  it('asks for every required field of the organization', () => {
    expect(Object.keys(validateStep('business', EMPTY_ORGANIZATION)).sort()).toEqual(['category', 'name', 'plan', 'sector'])
    expect(validateStep('business', business)).toEqual({})
  })

  it('checks the name length after trimming', () => {
    expect(validateStep('business', { ...business, name: '  a ' }).name).toBeDefined()
    expect(validateStep('business', { ...business, name: 'x'.repeat(81) }).name).toBeDefined()
  })

  it('needs the admin name and a valid e-mail', () => {
    expect(Object.keys(validateStep('admin', business)).sort()).toEqual(['adminEmail', 'adminName'])
    expect(validateStep('admin', { ...business, adminName: 'Ana Ruiz', adminEmail: 'ana@' }).adminEmail).toBeDefined()
    expect(validateStep('admin', { ...business, adminName: 'Ana Ruiz', adminEmail: ' ana@brasa.co ' })).toEqual({})
  })
})
