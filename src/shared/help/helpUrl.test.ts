import { describe, expect, it, vi } from 'vitest'
import { helpHref, helpPath, stripHelpPrefix } from './helpUrl'

vi.mock('@/shared/tenant/host', async (original) => ({
  ...(await original<typeof import('@/shared/tenant/host')>()),
  docsUrl: (path = '/') => `https://doc.quanela.com${path}`,
}))

describe('help center addresses (ADR 0035)', () => {
  it('drops only the /help prefix', () => {
    expect(stripHelpPrefix('/help')).toBe('/')
    expect(stripHelpPrefix('/help/orders/register-payment')).toBe('/orders/register-payment')
    expect(stripHelpPrefix('/help/orders/x#captura-payment')).toBe('/orders/x#captura-payment')
    expect(stripHelpPrefix('/helpdesk')).toBe('/helpdesk')
    expect(stripHelpPrefix('/orders/x')).toBe('/orders/x')
  })

  it('from the app (root or an organization): the absolute address on doc.quanela.com', () => {
    expect(helpHref('/help/orders/register-payment', { kind: 'tenant', code: 'A7K92P' })).toBe('https://doc.quanela.com/orders/register-payment')
    expect(helpHref(undefined, { kind: 'root' })).toBe('https://doc.quanela.com/')
  })

  it('on doc.quanela.com: paths of its own router, without the prefix', () => {
    expect(helpHref('/help/faq/faq', { kind: 'docs' })).toBe('/faq/faq')
    expect(helpPath('/help', { kind: 'docs' })).toBe('/')
  })

  it('without a root domain (previews): the app keeps its /help', () => {
    expect(helpHref('/help/faq/faq', { kind: 'path' })).toBe('/help/faq/faq')
    expect(helpPath('/help/faq/faq', { kind: 'path' })).toBe('/help/faq/faq')
  })
})
