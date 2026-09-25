import { readStoredRole, setActiveKitchenId, setActiveRoleId, writeLastKitchenSlug, writeStoredRole } from '@/shared/kitchen/activeKitchen'
import { fetchMyFeatures } from '@/shared/features/features'
import { ActiveKitchenContext, buildActiveKitchen, FEATURES_KEY, useMyContext } from '@/shared/kitchen/activeKitchenContext'
import { setLastAccount, toKitchenView } from '@/shared/kitchen/kitchensApi'
import { ErrorState } from '@/shared/ui/ErrorState'
import { useQuery } from '@tanstack/react-query'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useParams } from 'react-router-dom'
import { FullScreenLoading } from './FullScreenLoading'
import { KitchenInactivePage } from './KitchenInactivePage'

/**
 * Marco de una Cuenta (/k/:kitchenSlug/…). Resuelve el slug entre MIS
 * Cuentas (dk_my_context) y fija la Cuenta y el rol activos ANTES de montar
 * cualquier pantalla, para que su primera petición ya salga con los
 * encabezados x-dk-kitchen-id y x-dk-role-id. El subárbol se remonta al
 * cambiar de Cuenta o de rol (key), y la caché está separada por ambos
 * (queryClient): no puede quedar a la vista nada del contexto anterior.
 *
 * Un slug que no es mío lleva a "Tus cuentas": el slug nunca autoriza.
 */
export function KitchenScope() {
  const { kitchenSlug } = useParams<{ kitchenSlug: string }>()
  const { data: ctx, isLoading, isError, error, refetch } = useMyContext()
  // Elegir otro rol activo lo guarda (fuera de React) y fuerza un render para leerlo.
  const [, setRoleVersion] = useState(0)
  const account = ctx?.accounts.find((a) => a.slug === kitchenSlug)
  const storedRole = account ? readStoredRole(account.id) : null
  const kitchen = useMemo(() => (ctx && account ? toKitchenView(ctx, account, storedRole) : null), [ctx, account, storedRole])
  const organization = ctx?.organizations.find((o) => o.id === account?.organizationId) ?? null

  const setActiveRole = useCallback(
    (roleId: string) => {
      if (!account) return
      writeStoredRole(account.id, roleId)
      setRoleVersion((v) => v + 1)
    },
    [account],
  )
  // Durante el render (no en un efecto): los efectos de los hijos corren
  // antes que los del padre y sus consultas saldrían sin Cuenta o sin rol.
  if (kitchen) {
    setActiveKitchenId(kitchen.id)
    setActiveRoleId(kitchen.activeRoleId || null)
  }

  // Funciones de la Cuenta activa (después de fijar Cuenta y rol: la clave de
  // caché y los encabezados ya son los de este contexto).
  const { data: features } = useQuery({ queryKey: FEATURES_KEY, queryFn: fetchMyFeatures, enabled: Boolean(kitchen), staleTime: 60_000 })

  const value = useMemo(
    () => (kitchen ? buildActiveKitchen(kitchen, { organization, setActiveRole, features }) : null),
    [kitchen, organization, setActiveRole, features],
  )

  const kitchenId = kitchen?.id
  useEffect(() => {
    if (!kitchenId) return
    // Para volver a esta Cuenta al iniciar sesión, también desde otro equipo. No crítico.
    setLastAccount(kitchenId).catch(() => {})
  }, [kitchenId])

  useEffect(() => {
    if (!kitchen) return
    writeLastKitchenSlug(kitchen.slug)
    document.title = `${kitchen.name} · Dark Kitchen`
    return () => {
      document.title = 'Dark Kitchen'
    }
  }, [kitchen])

  if (isLoading) return <FullScreenLoading />
  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-6">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    )
  }
  if (!kitchen || !value) return <Navigate to="/cuentas" replace state={{ missingSlug: kitchenSlug }} />
  if (!kitchen.active && !kitchen.isPlatformAdmin) return <KitchenInactivePage name={kitchen.name} />

  return (
    <ActiveKitchenContext value={value}>
      <Fragment key={`${kitchen.id}:${kitchen.activeRoleId}`}>
        <Outlet />
      </Fragment>
    </ActiveKitchenContext>
  )
}
