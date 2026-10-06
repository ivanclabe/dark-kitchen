import { CreateCustomerModal } from '@/modules/customers/components/CreateCustomerModal'
import { listCustomersPage } from '@/modules/customers/api/customers'
import type { Customer } from '@/modules/customers/types'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { OrderBuilder } from '@/modules/orders/components/OrderBuilder'
import { CancelOrderDialog, ConfirmOrderDialog } from '@/modules/orders/board/BoardDialogs'
import type { Order } from '@/modules/orders/types'
import { useCreateOrder } from '@/modules/orders/hooks/useOrders'
import { Button } from '@/shared/ui/Button'
import { Combobox } from '@/shared/ui/Combobox'
import { Drawer } from '@/shared/ui/Drawer'
import { FormField } from '@/shared/ui/FormField'
import { getErrorMessage } from '@/shared/utils/errors'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'

/** Customers shown while typing (searched in the database, ADR 0030). */
const CUSTOMER_RESULTS = 20
const SEARCH_DELAY_MS = 250

/** A picked customer, enough to show it in the field. */
export interface CustomerChoice {
  id: string
  fullName: string
  phone: string | null
}

/**
 * Nuevo pedido — el mismo flujo que tenía la pantalla Pedidos: elegir (o
 * crear al vuelo) el cliente, crear el borrador y cargarle los platos con el
 * OrderBuilder de siempre. El borrador aparece de inmediato en la columna
 * "Por confirmar" del tablero; se puede confirmar desde acá o desde la tarjeta.
 *
 * ADR 0030: the customer is searched in the database while typing (never the
 * whole list), and `initialCustomer` opens it already chosen (from a customer).
 */
export function NewOrderDrawer({ open, onClose, initialCustomer }: { open: boolean; onClose: () => void; initialCustomer?: CustomerChoice }) {
  const { kitchen } = useActiveKitchen()
  const createOrder = useCreateOrder()
  const [customerId, setCustomerId] = useState(initialCustomer?.id ?? '')
  const [picked, setPicked] = useState<CustomerChoice | null>(initialCustomer ?? null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [query])
  const results = useQuery({
    queryKey: ['customers', 'picker', kitchen.id, debouncedQuery],
    queryFn: () =>
      listCustomersPage({
        search: debouncedQuery,
        status: 'all',
        sort: debouncedQuery ? 'name' : null,
        dir: null,
        page: 0,
        pageSize: CUSTOMER_RESULTS,
        createdFrom: null,
        createdTo: null,
        minOrders: null,
        minBalance: null,
        maxBalance: null,
      }),
    enabled: open,
    placeholderData: keepPreviousData,
  })
  const [error, setError] = useState<string | null>(null)
  const [createCustomerQuery, setCreateCustomerQuery] = useState<string | null>(null)
  const [created, setCreated] = useState<{ id: string; orderNumber: number; customerName: string } | null>(null)
  const [confirming, setConfirming] = useState<Order | null>(null)
  const [cancelling, setCancelling] = useState<Order | null>(null)

  const customerOptions = useMemo(() => {
    const rows = results.data?.rows ?? []
    const options = rows.map((c) => ({ value: c.id, label: c.fullName, sublabel: c.phone ?? undefined }))
    // The chosen customer stays an option even if the current search does not include it.
    if (picked && !options.some((o) => o.value === picked.id)) options.unshift({ value: picked.id, label: picked.fullName, sublabel: picked.phone ?? undefined })
    return options
  }, [results.data, picked])

  function choose(id: string) {
    setCustomerId(id)
    const row = results.data?.rows.find((c) => c.id === id)
    if (row) setPicked({ id: row.id, fullName: row.fullName, phone: row.phone })
  }

  async function startOrder(forCustomerId: string) {
    setError(null)
    try {
      const order = await createOrder.mutateAsync({ customerId: forCustomerId })
      setCreated({ id: order.id, orderNumber: order.orderNumber, customerName: order.customerName })
    } catch (err) {
      setError(getErrorMessage(err, 'Error al crear el pedido'))
    }
  }

  function handleCustomerCreated(customer: Customer) {
    setCreateCustomerQuery(null)
    setCustomerId(customer.id)
    setPicked({ id: customer.id, fullName: customer.fullName, phone: customer.phone })
    void startOrder(customer.id)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (customerId) void startOrder(customerId)
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={created ? `Nuevo pedido #${created.orderNumber}` : 'Nuevo pedido'}
        subtitle={created ? `Cliente: ${created.customerName} · agrega los platos y confírmalo` : 'Elige el cliente para empezar'}
      >
        {created ? (
          <OrderBuilder orderId={created.id} onConfirm={setConfirming} onCancel={setCancelling} />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Cliente" required error={error}>
              {() => (
                <Combobox
                  value={customerId}
                  onChange={choose}
                  options={customerOptions}
                  onQueryChange={setQuery}
                  filterLocally={false}
                  placeholder="Nombre o teléfono… (si no existe, créalo desde aquí)"
                  emptyMessage="Sin clientes con ese nombre o teléfono"
                  onCreateNew={(query) => setCreateCustomerQuery(query)}
                />
              )}
            </FormField>
            <Button type="submit" variant="primary" icon={Plus} loading={createOrder.isPending} disabled={!customerId} className="w-full">
              Crear pedido
            </Button>
          </form>
        )}
      </Drawer>

      <CreateCustomerModal
        open={createCustomerQuery !== null}
        onClose={() => setCreateCustomerQuery(null)}
        initialQuery={createCustomerQuery ?? ''}
        onCreated={handleCustomerCreated}
      />
      {confirming && <ConfirmOrderDialog ticket={confirming} onClose={() => setConfirming(null)} />}
      {cancelling && <CancelOrderDialog ticket={cancelling} onClose={() => setCancelling(null)} />}
    </>
  )
}
