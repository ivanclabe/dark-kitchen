import {
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  tableWrapperClass,
  tdClass,
  thClass,
} from '@/shared/ui/formClasses'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useCreateMenu, useMenus, useSetMenuActive } from '../hooks/useMenus'

export function MenusPage() {
  const { data: menus, isLoading } = useMenus()
  const createMenu = useCreateMenu()
  const setActive = useSetMenuActive()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    await createMenu.mutateAsync({ name, description: description || undefined })
    setName('')
    setDescription('')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-50">Menús</h1>
        <Link to="/menus/dia" className={secondaryButtonClass}>
          Menú del día
        </Link>
      </div>

      <form onSubmit={handleCreate} className={`${cardClass} grid grid-cols-1 gap-4 sm:grid-cols-3`}>
        <div>
          <label className={labelClass}>Nombre *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
        </div>
        <div>
          <label className={labelClass}>Descripción</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={createMenu.isPending} className={primaryButtonClass}>
            Crear menú
          </button>
        </div>
      </form>

      <div className={tableWrapperClass}>
        <table className="min-w-full divide-y divide-neutral-800">
          <thead className="bg-neutral-900">
            <tr>
              <th className={thClass}>Nombre</th>
              <th className={thClass}>Descripción</th>
              <th className={thClass}>Estado</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {isLoading && (
              <tr>
                <td className={tdClass} colSpan={4}>
                  Cargando…
                </td>
              </tr>
            )}
            {menus?.map((menu) => (
              <tr key={menu.id} className={menu.active ? '' : 'opacity-50'}>
                <td className={tdClass}>{menu.name}</td>
                <td className={tdClass}>{menu.description ?? '—'}</td>
                <td className={tdClass}>{menu.active ? 'Activo' : 'Inactivo'}</td>
                <td className={`${tdClass} space-x-3 text-right`}>
                  <Link to={`/menus/${menu.id}`} className="text-orange-500 hover:underline">
                    Platos
                  </Link>
                  <button
                    onClick={() => setActive.mutate({ id: menu.id, active: !menu.active })}
                    className="text-neutral-400 hover:underline"
                  >
                    {menu.active ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
