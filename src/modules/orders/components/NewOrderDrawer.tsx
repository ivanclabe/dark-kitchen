import { CreateCustomerModal } from '@/modules/customers/components/CreateCustomerModal'
import { useCustomers } from '@/modules/customers/hooks/useCustomers'
import type { Customer } from '@/modules/customers/types'
import { OrderBuilder } from '@/modules/orders/components/OrderBuilder'
import { useCreateOrder } from '@/modules/orders/hooks/useOrders'
import { Button } from '@/shared/ui/Button'
import { Combobox } from '@/shared/ui/Combobox'
import { Drawer } from '@/shared/ui/Drawer'
import { FormField } from '@/shared/ui/FormField'
import { getErrorMessage } from '@/shared/utils/errors'
import { Plus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'

/**
 * Nuevo pedido — el mismo flujo que tenía la pantalla Pedidos: elegir (o
 * crear al vuelo) el cliente, crear el borrador y cargarle los platos con el
 * OrderBuilder de siempre. El borrador aparece de inmediato en la columna
 * "Por confirmar" del tablero; se puede confirmar desde acá o desde la tarjeta.
 */
export function NewOrderDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: customers } = useCustomers()
  const createOrder = useCreateOrder()
  const [customerId, setCustomerId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [createCustomerQuery, setCreateCustomerQuery] = useState<string | null>(null)
  const [created, setCreated] = useState<{ id: string; orderNumber: number; customerName: string } | null>(null)

  const customerOptions = useMemo(() => customers?.map((c) => ({ value: c.id, label: c.fullName, sublabel: c.phone ?? undefined })) ?? [], [customers])

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
          <OrderBuilder orderId={created.id} />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Cliente" required error={error}>
              {() => (
                <Combobox
                  value={customerId}
                  onChange={setCustomerId}
                  options={customerOptions}
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
    </>
  )
}
