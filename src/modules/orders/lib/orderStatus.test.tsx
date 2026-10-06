// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { OrderStatus } from '../types'
import { OrderStatusBadge, orderStatusLabel } from './orderStatus'
import { ORDER_STATUS_CONFIG } from './orderVisuals'

afterEach(cleanup)

describe('one vocabulary for the order status (ADR 0031, D3)', () => {
  it('the badge says what the board says', () => {
    const all = Object.keys(ORDER_STATUS_CONFIG) as OrderStatus[]
    expect(all.map(orderStatusLabel)).toEqual(['Por confirmar', 'En cola', 'Preparando', 'Listo', 'En ruta', 'Entregado', 'Cancelado'])
    render(<OrderStatusBadge status="CONFIRMADO" />)
    expect(screen.getByText('En cola')).toBeTruthy()
  })
})
