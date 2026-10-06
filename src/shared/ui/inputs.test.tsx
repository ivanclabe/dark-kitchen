// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { CurrencyInput } from './CurrencyInput'
import { EmailInput } from './EmailInput'
import { FormField } from './FormField'
import { NumberInput } from './NumberInput'
import { phoneError } from '../utils/phone'
import { PhoneInput } from './PhoneInput'

afterEach(cleanup)

function Money({ decimals = 0 as 0 | 2, initial = null as number | null }) {
  const [v, setV] = useState<number | null>(initial)
  return (
    <>
      <FormField label="Precio de venta" info="Lo que paga el cliente por el plato.">
        {(a11y) => <CurrencyInput {...a11y} value={v} onValueChange={setV} decimals={decimals} />}
      </FormField>
      <output>{String(v)}</output>
    </>
  )
}

describe('CurrencyInput (ADR 0039)', () => {
  it('shows pesos with dots while typing and gives a clean number', () => {
    render(<Money />)
    const input = screen.getByLabelText('Precio de venta')
    fireEvent.change(input, { target: { value: '1250000' } })
    expect((input as HTMLInputElement).value).toBe('1.250.000')
    expect(screen.getByRole('status').textContent).toBe('1250000')
    expect(screen.getByText('COP')).toBeTruthy()
  })

  it('cents only where there are cents; empty is no value', () => {
    render(<Money decimals={2} />)
    const input = screen.getByLabelText('Precio de venta')
    fireEvent.change(input, { target: { value: '3,25' } })
    expect(screen.getByRole('status').textContent).toBe('3.25')
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByRole('status').textContent).toBe('null')
  })

  it('an existing price is shown formatted; the ⓘ explains the field', () => {
    render(<Money initial={25000} />)
    expect((screen.getByLabelText('Precio de venta') as HTMLInputElement).value).toBe('25.000')
    expect(screen.getByRole('button', { name: 'Qué es «Precio de venta»' })).toBeTruthy()
    expect(screen.getByRole('tooltip').textContent).toBe('Lo que paga el cliente por el plato.')
  })
})

function Phone({ initial = '' }: { initial?: string }) {
  const [v, setV] = useState(initial)
  return (
    <>
      <FormField label="Teléfono" error={phoneError(v, { original: initial })}>
        {(a11y) => <PhoneInput {...a11y} value={v} onValueChange={setV} />}
      </FormField>
      <output>{v}</output>
    </>
  )
}

describe('PhoneInput (ADR 0039)', () => {
  it('Colombia by default; a valid mobile comes out in E.164', () => {
    render(<Phone />)
    expect(screen.getByLabelText('País: Colombia')).toBeTruthy()
    const input = screen.getByLabelText('Teléfono')
    fireEvent.change(input, { target: { value: '3001234567' } })
    expect((input as HTMLInputElement).value).toBe('300 123 4567')
    expect(screen.getByRole('status').textContent).toBe('+573001234567')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('an incomplete number says what is wrong', () => {
    render(<Phone />)
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '300 12' } })
    expect(screen.getByRole('alert').textContent).toMatch(/empieza por 3 y tiene 10 dígitos/)
  })

  it('another country', () => {
    render(<Phone />)
    fireEvent.change(screen.getByLabelText('País: Colombia'), { target: { value: 'MX' } })
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '5512345678' } })
    expect(screen.getByRole('status').textContent).toBe('+525512345678')
  })

  it('a stored phone opens split in its country and number; an old WhatsApp id is kept as it is', () => {
    render(<Phone initial="+573001234567" />)
    expect((screen.getByLabelText('Teléfono') as HTMLInputElement).value).toBe('300 123 4567')
    cleanup()
    render(<Phone initial="e9f1aa22b3" />)
    expect((screen.getByLabelText('Teléfono') as HTMLInputElement).value).toBe('e9f1aa22b3')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('NumberInput and EmailInput (ADR 0039)', () => {
  it('a quantity with the decimal comma and its unit', () => {
    function Q() {
      const [v, setV] = useState<number | null>(null)
      return (
        <>
          <NumberInput aria-label="Cantidad" value={v} onValueChange={setV} decimals={3} unit="kg" />
          <output>{String(v)}</output>
        </>
      )
    }
    render(<Q />)
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '1,5' } })
    expect(screen.getByRole('status').textContent).toBe('1.5')
    expect(screen.getByText('kg')).toBeTruthy()
  })

  it('an e-mail loses spaces and capitals when leaving the field', () => {
    function E() {
      const [v, setV] = useState('')
      return <EmailInput aria-label="Correo" value={v} onValueChange={setV} />
    }
    render(<E />)
    const input = screen.getByLabelText('Correo') as HTMLInputElement
    fireEvent.change(input, { target: { value: '  Ana@Correo.COM ' } })
    fireEvent.blur(input)
    expect(input.value).toBe('ana@correo.com')
    expect(input.type).toBe('email')
  })
})
