import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { cardLabel, checkoutUrl, eventChecksum, integritySignature, isAllowedReturnUrl, verifyEvent, type WompiEvent } from './wompi'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

const event = (over: Partial<WompiEvent> = {}): WompiEvent => ({
  event: 'transaction.updated',
  data: { transaction: { id: '1234-1610641025-49201', status: 'APPROVED', reference: 'QNL-9VJ58Y-0001-1', amount_in_cents: 4990000, currency: 'COP' } },
  environment: 'test',
  signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'] },
  timestamp: 1530291411,
  ...over,
})

describe('Wompi signatures (ADR 0066)', () => {
  it('integrity: reference + amount in cents + currency + secret', async () => {
    expect(await integritySignature('QNL-9VJ58Y-0001-1', 4990000, 'COP', 'test_integrity_x')).toBe(sha('QNL-9VJ58Y-0001-14990000COPtest_integrity_x'))
  })

  it('event checksum: the listed properties in order, the timestamp and the secret', async () => {
    const e = event()
    expect(await eventChecksum(e, 'test_events_y')).toBe(sha('1234-1610641025-49201APPROVED49900001530291411test_events_y'))
  })

  it('accepts a signed event and rejects a changed one', async () => {
    const e = event()
    const checksum = await eventChecksum(e, 'test_events_y')
    e.signature!.checksum = checksum
    expect((await verifyEvent(e, 'test_events_y', checksum.toUpperCase())).valid).toBe(true)

    const tampered = structuredClone(e)
    tampered.data.transaction!.amount_in_cents = 100
    expect((await verifyEvent(tampered, 'test_events_y', checksum)).valid).toBe(false)
    expect((await verifyEvent(e, 'otro_secreto', checksum)).valid).toBe(false)
    expect((await verifyEvent(event({ signature: undefined }), 'test_events_y', null)).valid).toBe(false)
  })

  it('the properties come from each event, not from the code', async () => {
    const e = event({ signature: { properties: ['transaction.reference', 'transaction.status'] } })
    expect(await eventChecksum(e, 's')).toBe(sha('QNL-9VJ58Y-0001-1APPROVED1530291411s'))
  })
})

describe('Wompi checkout', () => {
  it('builds the Web Checkout address with the integrity signature and no personal data', () => {
    const url = new URL(checkoutUrl({ publicKey: 'pub_test_x', currency: 'COP', amountInCents: 4990000, reference: 'R-1', signature: 'abc', redirectUrl: 'https://9vj58y.quanela.com/k/x/' }))
    expect(url.origin + url.pathname).toBe('https://checkout.wompi.co/p/')
    expect(url.searchParams.get('amount-in-cents')).toBe('4990000')
    expect(url.searchParams.get('signature:integrity')).toBe('abc')
    // No personal data in the address (ADR 0071): the customer types it on Wompi's page.
    expect([...url.searchParams.keys()].some((k) => k.startsWith('customer-data'))).toBe(false)
  })

  it('returns only to the app', () => {
    const hosts = ['quanela.com']
    expect(isAllowedReturnUrl('https://9vj58y.quanela.com/k/a/', hosts)).toBe(true)
    expect(isAllowedReturnUrl('https://quanela.com/', hosts)).toBe(true)
    expect(isAllowedReturnUrl('http://9vj58y.localhost:5180/k/a/', hosts)).toBe(true)
    expect(isAllowedReturnUrl('https://quanela.com.evil.co/', hosts)).toBe(false)
    expect(isAllowedReturnUrl('http://quanela.com/', hosts)).toBe(false)
    expect(isAllowedReturnUrl('javascript:alert(1)', hosts)).toBe(false)
  })

  it('names a saved card without its number', () => {
    expect(cardLabel('VISA', '4242')).toBe('VISA •••• 4242')
    expect(cardLabel('MASTERCARD', '0004')).toBe('Mastercard •••• 0004')
    expect(cardLabel(null, null)).toBe('Tarjeta')
  })
})
