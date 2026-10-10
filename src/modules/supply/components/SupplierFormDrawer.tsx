import { Button } from '@/shared/ui/Button'
import { emailError } from '@/shared/utils/email'
import { EmailInput } from '@/shared/ui/EmailInput'
import { PhoneInput } from '@/shared/ui/PhoneInput'
import { phoneError } from '@/shared/utils/phone'
import { Drawer } from '@/shared/ui/Drawer'
import { FormField, Input } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage, isUniqueViolation } from '@/shared/utils/errors'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useCreateSupplier, useUpdateSupplier } from '../hooks/useSuppliers'
import type { Supplier } from '../types'

const schema = z.object({
  name: z.string().min(1, 'Requerido'),
  taxId: z.string().optional(),
  phone: z.string().optional(),
  email: z
    .string()
    .optional()
    .refine((v) => !emailError(v ?? ''), { message: 'Revisa el correo: falta la @ o el dominio (por ejemplo, ventas@proveedor.com).' }),
  address: z.string().optional(),
  contactName: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const legendClass = 'mb-3 text-xs font-semibold tracking-wide text-neutral-400 uppercase'

const emptyValues: FormValues = { name: '', taxId: '', phone: '', email: '', address: '', contactName: '' }

/** Alta y edición de proveedor — mismos campos y validación que la antigua SuppliersPage, en un Drawer. */
export function SupplierFormDrawer({ supplier, open, onClose }: { supplier: Supplier | null; open: boolean; onClose: () => void }) {
  const createSupplier = useCreateSupplier()
  const updateSupplier = useUpdateSupplier()
  const { show } = useToast()

  const {
    register,
    control,
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
      // ADR 0049 (D9): one NIT per account.
      show(isUniqueViolation(err) ? 'Ya tienes un proveedor con ese NIT. Búscalo en la lista.' : getErrorMessage(err, 'No se pudo guardar el proveedor'), 'error')
    }
  }

  const submitting = createSupplier.isPending || updateSupplier.isPending

  return (
    <Drawer open={open} onClose={onClose} title={supplier ? 'Editar proveedor' : 'Nuevo proveedor'} subtitle={supplier?.name} size="sm">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* One column: the drawer is narrow and the phone (country + number) needs the full width. */}
        <fieldset className="space-y-4">
          <legend className={legendClass}>Empresa</legend>
          <FormField label="Nombre" required error={errors.name?.message}>
            {(a11y) => <Input {...a11y} {...register('name')} autoComplete="organization" placeholder="Distribuidora La Cosecha" />}
          </FormField>
          <FormField label="NIT o identificación" error={errors.taxId?.message}>
            {(a11y) => <Input {...a11y} {...register('taxId')} placeholder="900123456-7" />}
          </FormField>
          <FormField label="Dirección" error={errors.address?.message}>
            {(a11y) => <Input {...a11y} {...register('address')} autoComplete="street-address" />}
          </FormField>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className={legendClass}>Contacto</legend>
          <FormField label="Persona de contacto" error={errors.contactName?.message}>
            {(a11y) => <Input {...a11y} {...register('contactName')} autoComplete="name" />}
          </FormField>
          <FormField label="Teléfono" error={errors.phone?.message}>
            {(a11y) => (
              <Controller
                control={control}
                name="phone"
                rules={{ validate: (v) => phoneError(v ?? '', { original: supplier?.phone }) ?? true }}
                render={({ field }) => <PhoneInput {...a11y} name={field.name} value={field.value ?? ''} onValueChange={field.onChange} onBlur={field.onBlur} />}
              />
            )}
          </FormField>
          <FormField label="Correo" error={errors.email?.message}>
            {(a11y) => (
              <Controller
                control={control}
                name="email"
                render={({ field }) => <EmailInput {...a11y} name={field.name} value={field.value ?? ''} onValueChange={field.onChange} onBlur={field.onBlur} placeholder="ventas@proveedor.com" />}
              />
            )}
          </FormField>
        </fieldset>

        <Button type="submit" variant="primary" icon={supplier ? Pencil : Plus} loading={submitting} className="w-full">
          {supplier ? 'Guardar cambios' : 'Crear proveedor'}
        </Button>
      </form>
    </Drawer>
  )
}
