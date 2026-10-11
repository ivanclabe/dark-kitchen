// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PurchasePayment } from '../types'
import { PurchasePaymentChoice } from './PurchasePaymentChoice'

// ADR 0051 (D3): when confirming a purchase, cash (with its method) or on credit (with its due date).
function Harness({ initial, onValue }: { initial: PurchasePayment; onValue: (v: PurchasePayment) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <PurchasePaymentChoice
      value={value}
      onChange={(v) => {
        setValue(v)
        onValue(v)
      }}
    />
  )
}

afterEach(cleanup)

describe('¿Cómo se pagó?', () => {
  it('a supplier with a term starts on credit with its due date; switching to cash asks the method', () => {
    const values: PurchasePayment[] = []
    render(<Harness initial={{ mode: 'credit', dueDate: '2026-11-10' }} onValue={(v) => values.push(v)} />)
    expect((screen.getByLabelText('Vence') as HTMLInputElement).value).toBe('2026-11-10')
    fireEvent.click(screen.getByLabelText(/De contado/))
    fireEvent.change(screen.getByLabelText('Cómo se pagó'), { target: { value: 'Transferencia' } })
    expect(values.at(-1)).toEqual({ mode: 'cash', method: 'Transferencia' })
  })

  it('back to credit keeps no stale method', () => {
    const values: PurchasePayment[] = []
    render(<Harness initial={{ mode: 'cash', method: 'Efectivo' }} onValue={(v) => values.push(v)} />)
    fireEvent.click(screen.getByLabelText(/A crédito/))
    expect(values.at(-1)).toEqual({ mode: 'credit', dueDate: undefined })
  })
})
