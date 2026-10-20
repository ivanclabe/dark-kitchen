import { CustomerFormModal } from '@/modules/customers/components/CreateCustomerModal'
import { NewOrderDrawer } from '@/modules/orders/components/NewOrderDrawer'
import { CreateIngredientModal } from '@/modules/supply/components/CreateIngredientModal'
import { NewPurchaseDialog } from '@/modules/supply/components/NewPurchaseDialog'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CommandPalette } from './CommandPalette'
import { createActions, ShellActionsContext, type CreateKind, type ShellActionsValue } from './shellActionsContext'

/**
 * The account's global actions (ADR 0072): «Buscar y crear» (⌘K / Ctrl+K) and the creation dialogs that
 * already exist in each module, opened from anywhere without leaving the current screen.
 */
export function ShellActionsProvider({ children }: { children: ReactNode }) {
  const { can, path } = useActiveKitchen()
  const navigate = useNavigate()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [creating, setCreating] = useState<CreateKind | null>(null)
  const actions = useMemo(() => createActions(can), [can])

  const create = useCallback(
    (kind: CreateKind) => {
      setPaletteOpen(false)
      // A dish is created in the planner, with its photo and its place in the menu.
      if (kind === 'dish') navigate(path('/menu-planner?plato=nuevo'))
      else setCreating(kind)
    },
    [navigate, path],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const value = useMemo<ShellActionsValue>(() => ({ openPalette: () => setPaletteOpen(true), create, actions }), [create, actions])
  const close = () => setCreating(null)

  return (
    <ShellActionsContext value={value}>
      {children}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {creating === 'order' && <NewOrderDrawer open onClose={close} />}
      <CustomerFormModal
        open={creating === 'customer'}
        onClose={close}
        onSaved={(customer) => {
          close()
          navigate(path(`/customers/${customer.id}`))
        }}
      />
      <NewPurchaseDialog
        open={creating === 'purchase'}
        onClose={close}
        onCreated={(id) => {
          close()
          navigate(path(`/supply/compras/${id}`))
        }}
      />
      <CreateIngredientModal
        open={creating === 'ingredient'}
        initialQuery=""
        onClose={close}
        onCreated={(ingredient) => {
          close()
          navigate(path(`/supply/stock/${ingredient.id}`))
        }}
      />
    </ShellActionsContext>
  )
}
