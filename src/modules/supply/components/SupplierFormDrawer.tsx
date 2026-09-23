import { Button } from '@/shared/ui/Button'
import { Drawer } from '@/shared/ui/Drawer'
import { FormField, Input } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useCreateSupplier, useUpdateSupplier } from '../hooks/useSuppliers'
import type { Supplier } from '../types'

const schema = z.object({
  name: z.string().min(1, 'Requerido'),
  taxId: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  address: z.string().optional(),
  contactName: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const emptyValues: FormValues = { name: '', taxId: '', phone: '', email: '', address: '', contactName: '' }

/** Alta y edición de proveedor — mismos campos y validación que la antigua SuppliersPage, en un Drawer. */
export function SupplierFormDrawer({ supplier, open, onClose }: { supplier: Supplier | null; open: boolean; onClose: () => void }) {
  const createSupplier = useCreateSupplier()
  const updateSupplier = useUpdateSupplier()
  const { show } = useToast()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: supplier
      ? {
          name: supplier.name,
          taxId: supplier.taxId ?? '',
          phone: supplier.phone ?? '',
          email: supplier.email ?? '',
          address: supplier.address ?? '',
          contactName: supplier.contactName ?? '',
        }
      : emptyValues,
  })

  async function onSubmit(values: FormValues) {
    const input = {
      name: values.name,
      taxId: values.taxId || null,
      phone: values.phone || null,
      email: values.email || null,
      address: values.address || null,
      contactName: values.contactName || null,
    }
    try {
      if (supplier) {
        await updateSupplier.mutateAsync({ id: supplier.id, input })
        show(`Proveedor "${input.name}" actualizado.`)
      } else {
        await createSupplier.mutateAsync(input)
        show(`Proveedor "${input.name}" creado.`)
      }
      onClose()
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar el proveedor'), 'error')
    }
  }

  const submitting = createSupplier.isPending || updateSupplier.isPending

  return (
    <Drawer open={open} onClose={onClose} title={supplier ? 'Editar proveedor' : 'Nuevo proveedor'} subtitle={supplier?.name} size="sm">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Nombre" required error={errors.name?.message}>
          {(a11y) => <Input {...a11y} {...register('name')} autoComplete="organization" />}
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="NIT / identificación" error={errors.taxId?.message}>
            {(a11y) => <Input {...a11y} {...register('taxId')} />}
          </FormField>
          <FormField label="Teléfono" error={errors.phone?.message}>
            {(a11y) => <Input {...a11y} type="tel" inputMode="tel" {...register('phone')} autoComplete="tel" />}
          </FormField>
        </div>
        <FormField label="Correo" error={errors.email?.message}>
          {(a11y) => <Input {...a11y} inputMode="email" {...register('email')} autoComplete="email" />}
        </FormField>
        <FormField label="Contacto" error={errors.contactName?.message}>
          {(a11y) => <Input {...a11y} {...register('contactName')} />}
        </FormField>
        <FormField label="Dirección" error={errors.address?.message}>
          {(a11y) => <Input {...a11y} {...register('address')} autoComplete="street-address" />}
        </FormField>

        <Button type="submit" variant="primary" icon={supplier ? Pencil : Plus} loading={submitting} className="w-full">
          {supplier ? 'Guardar cambios' : 'Crear proveedor'}
        </Button>
      </form>
    </Drawer>
  )
}
